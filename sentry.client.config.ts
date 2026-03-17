/**
 * Sentry クライアントサイド設定（ブラウザ）
 *
 * ブラウザでのエラー監視・パフォーマンストレースを設定。
 * Next.js の Sentry プラグインが自動的にこのファイルをロードする。
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: VERCEL_ENV,
    ...(process.env.NEXT_PUBLIC_APP_VERSION && { release: process.env.NEXT_PUBLIC_APP_VERSION }),

    // サンプリングレート（環境別）
    // Production: 10%（コスト最適化）
    // Preview: 50%（テスト用）
    // Development: 100%（デバッグ用）
    tracesSampleRate: IS_PRODUCTION ? 0.1 : VERCEL_ENV === 'preview' ? 0.5 : 1.0,

    // Session Replay（本番のみ、エラー発生時に記録）
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: IS_PRODUCTION ? 1.0 : 0,

    // デバッグモード（開発環境のみ）
    debug: !IS_PRODUCTION && process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true',

    // 本番・プレビュー環境のみ有効
    enabled: IS_PRODUCTION || VERCEL_ENV === 'preview',

    // エラーフィルタリング
    beforeSend(event) {
      const errorMessage = event.exception?.values?.[0]?.value || '';

      // ブラウザ拡張機能やサードパーティスクリプトのエラーを除外
      const ignoredPatterns = [
        'ResizeObserver loop',
        'Non-Error promise rejection captured',
        'AbortError',
        'ChunkLoadError',
        'Loading chunk',
        'Network request failed',
      ];

      if (ignoredPatterns.some((pattern) => errorMessage.includes(pattern))) {
        return null;
      }

      return event;
    },

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
