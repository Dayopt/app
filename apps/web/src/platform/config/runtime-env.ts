import { dayoptUrls } from '@dayopt/config';

import { loadEnv } from './load-env';

export const env = loadEnv();

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isCI = env.CI === true;

export function getAppUrl(): string {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL;
  }

  // VERCEL_URL は「そのデプロイ固有」のホスト名（web-k94imlgmq-dayopt.vercel.app 等）で、
  // デプロイのたびに変わる。Production でこれを使うと canonical / sitemap / robots /
  // OG 画像の絶対 URL がすべてデプロイ固有ホストになる（2026-07-27 に本番で確認）。
  // Production は既知の正規ドメインを使い、VERCEL_URL は Preview の自己参照だけに使う。
  if (env.VERCEL_ENV === 'production') {
    return dayoptUrls.marketing;
  }

  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }

  if (isDevelopment) {
    return 'http://localhost:3000';
  }

  return dayoptUrls.marketing;
}

export function getSiteUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL || getAppUrl();
}
