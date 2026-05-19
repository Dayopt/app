import 'server-only';

/**
 * Stripe クライアント初期化
 *
 * サーバーサイドのみで使用する。
 * STRIPE_SECRET_KEY が未設定の場合は null を返す（graceful degradation）。
 */

import Stripe from 'stripe';

import { env } from '@/env';
import { logger } from '@/lib/logger';

let _stripe: Stripe | null = null;

/**
 * Stripe クライアントを取得する
 *
 * @returns Stripe インスタンス、または未設定の場合 null
 */
export function getStripe(): Stripe | null {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  if (!_stripe) {
    _stripe = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
    logger.info('Stripe client initialized');
  }

  return _stripe;
}

/**
 * Stripe クライアントを取得する（必須版）
 *
 * Stripe が未設定の場合はエラーをスローする。
 * 課金が必須の処理で使用。
 */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
  }
  return stripe;
}
