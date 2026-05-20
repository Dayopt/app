/**
 * Sentry Edge設定（Edge Runtime）
 *
 * Middleware、Edge API Routes用の軽量設定。
 * instrumentation.ts から動的にインポートされます。
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';

import { withPIIScrub } from '@/lib/sentry/scrub-pii';

// Edge環境ではSENTRY_DSNを優先（ランタイム環境変数）
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
// VERCEL_ENVはVercelが自動設定（production, preview, development）
const VERCEL_ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// DSNが設定されている場合のみ初期化
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: VERCEL_ENV,
    ...(process.env.NEXT_PUBLIC_APP_VERSION && { release: process.env.NEXT_PUBLIC_APP_VERSION }),

    // Edge環境は軽量設定
    // トレースサンプリングを低めに設定（コスト最適化）
    tracesSampleRate: IS_PRODUCTION ? 0.05 : 0.5,

    // デバッグモード無効（Edgeは軽量に）
    debug: false,

    // 本番・プレビュー環境のみ有効
    enabled: IS_PRODUCTION || VERCEL_ENV === 'preview',

    // Edge のフィルタリング + PII スクラビング
    beforeSend: withPIIScrub((event) => {
      // Edgeタイムアウトエラーは無視（正常動作の一部）
      const errorMessage = event.exception?.values?.[0]?.value || '';
      if (errorMessage.includes('Edge function has timed out')) {
        return null;
      }

      return event;
    }),
  });
}
