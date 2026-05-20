/**
 * Cloudflare Turnstile 設定（クライアント安全）
 *
 * サーバー専用の SECRET_KEY は Supabase Auth (Bot Protection) で管理する
 * ため、app 側はクライアントの site key のみ扱う。
 */

export const TURNSTILE_CONFIG = {
  SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
} as const;

export function isTurnstileEnabled(): boolean {
  return Boolean(TURNSTILE_CONFIG.SITE_KEY);
}
