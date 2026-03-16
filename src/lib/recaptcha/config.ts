/**
 * reCAPTCHA設定
 * @description Google reCAPTCHA v2/v3の設定と検証
 */

import { env } from '@/env';

export const RECAPTCHA_CONFIG = {
  // サイトキー（クライアントサイド — ビルド時置換）
  SITE_KEY_V3: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V3 || '',
  SITE_KEY_V2: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V2 || '',

  // シークレットキー（サーバーサイド）
  SECRET_KEY_V3: env.RECAPTCHA_SECRET_KEY_V3 || '',
  SECRET_KEY_V2: env.RECAPTCHA_SECRET_KEY_V2 || '',

  // スコアしきい値（v3）
  SCORE_THRESHOLD: {
    STRICT: 0.7, // 厳格（ロックアウト解除後）
    MODERATE: 0.5, // 中程度（通常時）
    LENIENT: 0.3, // 寛容（開発環境）
  },

  // 検証エンドポイント
  VERIFY_URL_V3: 'https://www.google.com/recaptcha/api/siteverify',
  VERIFY_URL_V2: 'https://www.google.com/recaptcha/api/siteverify',
} as const;

/**
 * reCAPTCHA v3が有効か確認
 */
export function isRecaptchaV3Enabled(): boolean {
  return Boolean(RECAPTCHA_CONFIG.SITE_KEY_V3 && RECAPTCHA_CONFIG.SECRET_KEY_V3);
}

/**
 * reCAPTCHA v2が有効か確認
 */
export function isRecaptchaV2Enabled(): boolean {
  return Boolean(RECAPTCHA_CONFIG.SITE_KEY_V2 && RECAPTCHA_CONFIG.SECRET_KEY_V2);
}

/**
 * 開発環境かどうか
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}
