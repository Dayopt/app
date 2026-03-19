import { env } from '@/env';

/**
 * アプリのベースURLを取得する
 * 優先順位: NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost
 *
 * 全てのusageがサーバーサイド（Route Handler, Server Component, tRPC Router）なので
 * VERCEL_URL（サーバーのみ利用可能）のフォールバックが動作する
 */
export function getAppUrl(): string {
  if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
