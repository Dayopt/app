/**
 * Resend Webhook エンドポイント
 *
 * Resend Dashboard → Webhooks でこのURLを登録:
 *   https://dayopt.app/api/webhooks/resend
 *
 * 監視イベント:
 * - email.bounced: バウンス検知（無効アドレス）
 * - email.complained: スパム苦情
 * - email.delivered: 配信成功（ログ用）
 *
 * @see https://resend.com/docs/dashboard/webhooks/introduction
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const maxDuration = 30;

import { env } from '@/env';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

// 遅延初期化: ビルド時にAPI_KEYが未設定でもクラッシュしないようにする
function getResend() {
  return new Resend(env.RESEND_API_KEY);
}
const WEBHOOK_SECRET = env.RESEND_WEBHOOK_SECRET;

/**
 * バウンス/苦情のメールアドレスをサプレッションリストに記録
 *
 * Resend の to フィールドは string[] なので、全アドレスを記録する。
 * UNIQUE制約で重複は無視（ON CONFLICT DO NOTHING）。
 */
async function recordSuppression(
  addresses: string[],
  reason: 'bounce' | 'complaint',
  sourceEventId: string | undefined,
): Promise<void> {
  const supabase = createServiceRoleClient();

  for (const email of addresses) {
    const { error } = await supabase.from('email_suppressions').upsert(
      {
        email: email.toLowerCase(),
        reason,
        source_event_id: sourceEventId ?? null,
      },
      { onConflict: 'email,reason' },
    );

    if (error) {
      logger.error('Failed to record email suppression', { email, reason, error });
    } else {
      logger.info('Email suppression recorded', { email, reason });
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Webhook署名検証
    if (!WEBHOOK_SECRET) {
      logger.error('RESEND_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const payload = await request.text();

    // svixヘッダーを抽出（Resendが内部的にsvixを使用）
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.warn('Resend webhook missing svix headers');
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    let event;
    try {
      event = getResend().webhooks.verify({
        payload,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret: WEBHOOK_SECRET,
      });
    } catch {
      logger.warn('Resend webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    switch (event.type) {
      case 'email.bounced': {
        const bouncedTo = event.data.to;
        logger.error('Email bounced', {
          emailId: event.data.email_id,
          to: bouncedTo,
          subject: event.data.subject,
        });
        await recordSuppression(bouncedTo, 'bounce', event.data.email_id);
        break;
      }

      case 'email.complained': {
        const complainedTo = event.data.to;
        logger.error('Email spam complaint', {
          emailId: event.data.email_id,
          to: complainedTo,
          subject: event.data.subject,
        });
        await recordSuppression(complainedTo, 'complaint', event.data.email_id);
        break;
      }

      case 'email.delivered':
        logger.info('Email delivered', {
          emailId: event.data.email_id,
          to: event.data.to,
        });
        break;

      case 'email.delivery_delayed':
        logger.warn('Email delivery delayed', {
          emailId: event.data.email_id,
          to: event.data.to,
        });
        break;

      default:
        // sent, opened, clicked, contact, domain イベントはログのみ
        logger.info('Resend webhook event', {
          type: event.type,
        });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error('Resend webhook error', { error });
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
