/**
 * Cloudflare Turnstile 設定（クライアント安全）
 *
 * サーバー専用の SECRET_KEY は verify.ts で env 経由で取得する。
 * このファイルはクライアントコンポーネントからも import される。
 */

export const TURNSTILE_CONFIG = {
  SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
  VERIFY_URL: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
} as const;

export function isTurnstileEnabled(): boolean {
  return Boolean(TURNSTILE_CONFIG.SITE_KEY);
}
