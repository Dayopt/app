/**
 * Stripe Webhook エンドポイント
 *
 * Stripe Dashboard → Webhooks でこのURLを登録:
 *   https://dayopt.app/api/webhooks/stripe
 *
 * 監視イベント:
 * - checkout.session.completed: チェックアウト完了
 * - customer.subscription.updated: サブスクリプション更新
 * - customer.subscription.deleted: サブスクリプション削除
 *
 * @see https://docs.stripe.com/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { env } from '@/env';
import type { SubscriptionStatus } from '@/features/settings/server/billing-service';
import { syncSubscriptionStatus } from '@/features/settings/server/billing-service';
import { logger } from '@/lib/logger';
import { requireStripe } from '@/platform/stripe/client';
import { createServiceRoleClient } from '@/platform/supabase/oauth';

// ─── Slack 通知 ──────────────────────────────────────

/**
 * 課金イベントをSlackに通知する（fire-and-forget）
 *
 * SLACK_BILLING_WEBHOOK_URL が未設定の場合は何もしない。
 */
async function notifySlack(text: string): Promise<void> {
  const webhookUrl = env.SLACK_BILLING_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    // Slack通知失敗はWebhook処理をブロックしない
    logger.warn('Slack billing notification failed', { error });
  }
}

/**
 * Stripe subscription status → Dayopt subscription status のマッピング
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled';
    case 'incomplete':
    case 'paused':
    default:
      return 'free';
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let stripe: ReturnType<typeof requireStripe>;
  try {
    stripe = requireStripe();
  } catch {
    logger.error('Stripe is not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.warn('Stripe webhook missing signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // RLS バイパスの admin client（webhook はユーザーコンテキストなし）
  const supabase = createServiceRoleClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === 'subscription' && session.subscription && session.customer) {
          const customerId =
            typeof session.customer === 'string' ? session.customer : session.customer.id;
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;

          await syncSubscriptionStatus(supabase, customerId, subscriptionId, 'active');
          logger.info('Checkout completed', { customerId, subscriptionId });
          await notifySlack(`🎉 新規サブスクリプション開始\nCustomer: ${customerId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        const status = mapStripeStatus(subscription.status);
        await syncSubscriptionStatus(supabase, customerId, subscription.id, status);
        logger.info('Subscription updated', {
          customerId,
          subscriptionId: subscription.id,
          status,
        });
        await notifySlack(`📝 サブスクリプション更新: ${status}\nCustomer: ${customerId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        await syncSubscriptionStatus(supabase, customerId, null, 'free');
        logger.info('Subscription deleted', { customerId });
        await notifySlack(`⚠️ サブスクリプション解約\nCustomer: ${customerId}`);
        break;
      }

      default:
        logger.info('Stripe webhook event (unhandled)', { type: event.type });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error('Stripe webhook processing error', { error, eventType: event.type });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
