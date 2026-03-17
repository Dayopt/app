/**
 * reCAPTCHA設定（クライアント安全）
 *
 * サーバー専用の SECRET_KEY は verify.ts で env 経由で取得する。
 * このファイルはクライアントコンポーネントからも import されるため、
 * サーバー専用の env を import してはいけない。
 */

export const RECAPTCHA_CONFIG = {
  // サイトキー（クライアントサイド — ビルド時置換）
  SITE_KEY_V3: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V3 || '',
  SITE_KEY_V2: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY_V2 || '',

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
 * reCAPTCHA v3が有効か確認（クライアント側はサイトキーのみで判定）
 */
export function isRecaptchaV3Enabled(): boolean {
  return Boolean(RECAPTCHA_CONFIG.SITE_KEY_V3);
}

/**
 * reCAPTCHA v2が有効か確認（クライアント側はサイトキーのみで判定）
 */
export function isRecaptchaV2Enabled(): boolean {
  return Boolean(RECAPTCHA_CONFIG.SITE_KEY_V2);
}
