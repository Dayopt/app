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

export const maxDuration = 30;

import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';

import { CancellationConfirmEmail } from '@/emails/CancellationConfirmEmail';
import { createEmailTranslator, type EmailLocale } from '@/emails/i18n';
import { PaymentFailedEmail } from '@/emails/PaymentFailedEmail';
import { PaymentRecoveredEmail } from '@/emails/PaymentRecoveredEmail';
import { ProStartEmail } from '@/emails/ProStartEmail';
import { TrialStartEmail } from '@/emails/TrialStartEmail';
import { env } from '@/env';
import type { SubscriptionStatus } from '@/features/settings/server/billing-service';
import { syncSubscriptionStatus } from '@/features/settings/server/billing-service';
import { getAppUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';
import { captureBusinessEvent } from '@/platform/sentry';
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

// ─── トランザクションメール送信 ─────────────────────────

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = getAppUrl();

/**
 * stripe_customer_id からユーザーのメールアドレス・名前・ロケールを取得
 */
async function getUserByCustomerId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  stripeCustomerId: string,
): Promise<{ email: string; userName: string; locale: EmailLocale } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (error || !data) {
    logger.warn('Failed to look up user for transactional email', { stripeCustomerId, error });
    return null;
  }

  const profile = data;

  // Supabase Auth からメールアドレスを取得
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.admin.getUserById(profile.id);

  if (authError || !user?.email) {
    logger.warn('Failed to get user email for transactional email', {
      userId: profile.id,
      error: authError,
    });
    return null;
  }

  // user_settings から preferred_locale を取得
  const { data: settingsData } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', profile.id)
    .single();
  const rawLocale = (settingsData as Record<string, unknown> | null)?.preferred_locale;
  const locale: EmailLocale = (rawLocale as EmailLocale) ?? 'en';

  return { email: user.email, userName: profile.full_name || 'there', locale };
}

/**
 * メールアドレスをマスクしてログ用に安全な形式にする
 * 例: "user@example.com" → "use***@example.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return '***';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

/**
 * トランザクションメール送信（fire-and-forget）
 * メール送信失敗は webhook 処理をブロックしない
 */
async function sendTransactionalEmail(
  to: string,
  subject: string,
  react: React.ReactElement,
  context: string,
): Promise<void> {
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `Dayopt <${FROM_EMAIL}>`,
      to,
      subject,
      react,
    });

    if (error) {
      logger.error(`${context} failed`, { error, to: maskEmail(to) });
    } else {
      logger.info(`${context} sent`, { to: maskEmail(to) });
    }
  } catch (error) {
    logger.error(`${context} failed unexpectedly`, { error, to: maskEmail(to) });
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

  // ─── 冪等性ガード ───────────────────────────────────
  // 同一 event.id の重複処理を防止（Stripe はリトライする）
  const { error: idempotencyError } = await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type });

  if (idempotencyError) {
    // 23505 = unique_violation → 処理済みイベント
    if (idempotencyError.code === '23505') {
      logger.info('Duplicate webhook event, skipping', { eventId: event.id });
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    // その他のDB エラーは処理を続行（冪等性チェック失敗でイベントを落とさない）
    logger.warn('Idempotency check failed, proceeding with processing', {
      eventId: event.id,
      error: idempotencyError,
    });
  }

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

          // 実際の subscription ステータスを取得（trialing vs active）
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const status = mapStripeStatus(sub.status);

          await syncSubscriptionStatus(supabase, customerId, subscriptionId, status);
          captureBusinessEvent('billing.checkout_completed', { customerId, status });
          logger.info('Checkout completed', { customerId, subscriptionId, status });
          await notifySlack(
            `🎉 新規サブスクリプション開始\nCustomer: ${customerId}\nStatus: ${status}`,
          );

          // トランザクションメール送信
          const user = await getUserByCustomerId(supabase, customerId);
          if (user) {
            const t = createEmailTranslator(user.locale);
            if (status === 'trialing') {
              const trialEnd = sub.trial_end
                ? new Date(sub.trial_end * 1000).toLocaleDateString(
                    user.locale === 'ja' ? 'ja-JP' : 'en-US',
                    { year: 'numeric', month: 'long', day: 'numeric' },
                  )
                : '7 days from now';
              await sendTransactionalEmail(
                user.email,
                t('trialStart.subject'),
                TrialStartEmail({
                  userName: user.userName,
                  trialEndDate: trialEnd,
                  locale: user.locale,
                  appUrl: APP_URL,
                }),
                'Trial start email',
              );
            } else if (status === 'active') {
              await sendTransactionalEmail(
                user.email,
                t('proStart.subject'),
                ProStartEmail({ userName: user.userName, locale: user.locale, appUrl: APP_URL }),
                'Pro start email',
              );
            }
          }
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
        const previousStatus = event.data.previous_attributes
          ? mapStripeStatus(
              (event.data.previous_attributes as { status?: Stripe.Subscription.Status }).status ??
                subscription.status,
            )
          : null;

        await syncSubscriptionStatus(supabase, customerId, subscription.id, status);
        captureBusinessEvent('billing.subscription_changed', { customerId, toStatus: status });
        logger.info('Subscription updated', {
          customerId,
          subscriptionId: subscription.id,
          status,
          previousStatus,
        });
        await notifySlack(`📝 サブスクリプション更新: ${status}\nCustomer: ${customerId}`);

        // trialing → active: Pro開始メール
        if (previousStatus === 'trialing' && status === 'active') {
          const updatedUser = await getUserByCustomerId(supabase, customerId);
          if (updatedUser) {
            const t = createEmailTranslator(updatedUser.locale);
            await sendTransactionalEmail(
              updatedUser.email,
              t('proStart.subject'),
              ProStartEmail({
                userName: updatedUser.userName,
                locale: updatedUser.locale,
                appUrl: APP_URL,
              }),
              'Pro start email (trial conversion)',
            );
          }
        }

        // past_due → active: 支払い復旧メール
        if (previousStatus === 'past_due' && status === 'active') {
          const recoveredUser = await getUserByCustomerId(supabase, customerId);
          if (recoveredUser) {
            const t = createEmailTranslator(recoveredUser.locale);
            await sendTransactionalEmail(
              recoveredUser.email,
              t('paymentRecovered.subject'),
              PaymentRecoveredEmail({
                userName: recoveredUser.userName,
                locale: recoveredUser.locale,
                appUrl: APP_URL,
              }),
              'Payment recovered email',
            );
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;

        await syncSubscriptionStatus(supabase, customerId, null, 'canceled');
        captureBusinessEvent('billing.subscription_changed', { customerId, toStatus: 'canceled' });
        logger.info('Subscription deleted', { customerId });
        await notifySlack(`⚠️ サブスクリプション解約\nCustomer: ${customerId}`);

        // 解約確認メール
        const cancelUser = await getUserByCustomerId(supabase, customerId);
        if (cancelUser) {
          const t = createEmailTranslator(cancelUser.locale);
          const rawPeriodEnd = (subscription as unknown as { current_period_end?: number })
            .current_period_end;
          const periodEnd = rawPeriodEnd
            ? new Date(rawPeriodEnd * 1000).toLocaleDateString(
                cancelUser.locale === 'ja' ? 'ja-JP' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric' },
              )
            : 'your current billing period';
          await sendTransactionalEmail(
            cancelUser.email,
            t('cancellationConfirm.subject'),
            CancellationConfirmEmail({
              userName: cancelUser.userName,
              periodEndDate: periodEnd,
              locale: cancelUser.locale,
              appUrl: APP_URL,
            }),
            'Cancellation confirm email',
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        captureBusinessEvent(
          'billing.payment_failed',
          { customerId: customerId ?? 'unknown' },
          'warning',
        );
        logger.warn('Payment failed', { customerId });
        await notifySlack(`🚨 支払い失敗\nCustomer: ${customerId ?? 'unknown'}`);

        // 支払い失敗メール
        if (customerId) {
          const paymentUser = await getUserByCustomerId(supabase, customerId);
          if (paymentUser) {
            const t = createEmailTranslator(paymentUser.locale);
            await sendTransactionalEmail(
              paymentUser.email,
              t('paymentFailed.subject'),
              PaymentFailedEmail({
                userName: paymentUser.userName,
                locale: paymentUser.locale,
                appUrl: APP_URL,
              }),
              'Payment failed email',
            );
          }
        }
        break;
      }

      default:
        logger.info('Stripe webhook event (unhandled)', { type: event.type });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error('Stripe webhook processing error', { error, eventType: event.type });
    Sentry.captureException(error, {
      tags: { source: 'stripe_webhook', eventType: event.type },
      contexts: { webhook: { eventId: event.id, eventType: event.type } },
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
