/**
 * アプリのベースURLを取得する
 * 優先順位: NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost
 *
 * Metadata / sitemap / JSON-LD など、Supabase 環境変数が不要な経路でも使うため、
 * full server env validation は通さず URL に必要な値だけを直接参照する。
 */
export function getAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return 'http://localhost:3000';
}
