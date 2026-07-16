/**
 * Sentry Edge設定（Edge Runtime）
 *
 * Middleware、Edge API Routes用の軽量設定。
 * instrumentation.ts から動的にインポートされます。
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';

import {
  scrubSentryBreadcrumb,
  scrubSentrySpan,
  scrubSentryTransaction,
  withPIIScrub,
} from '@/lib/sentry/scrub-pii';

// Edge環境ではSENTRY_DSNを優先（ランタイム環境変数）
const SENTRY_DSN = process.env.SENTRY_DSN;
// VERCEL_ENVはVercelが自動設定（production, preview, development）
const VERCEL_ENV = process.env.VERCEL_ENV;
const IS_SENTRY_PRODUCTION = VERCEL_ENV === 'production';
const OPERATOR_SMOKE_TRACE_PREFIX = 'operator.sentry_smoke.';

// DSNが設定されている場合のみ初期化
if (SENTRY_DSN && IS_SENTRY_PRODUCTION) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    sendDefaultPii: false,
    // release は withSentryConfig が build 時に注入する（next.config の release.name = VERCEL_GIT_COMMIT_SHA）。
    // ここで明示すると source map upload 時の release と runtime がズレるため上書きしない。

    // Edge環境は軽量設定
    // トレースサンプリングを低めに設定（コスト最適化）
    tracesSampler: ({ name, inheritOrSampleWith }) =>
      name.startsWith(OPERATOR_SMOKE_TRACE_PREFIX) ? 1 : inheritOrSampleWith(0.05),

    // デバッグモード無効（Edgeは軽量に）
    debug: false,

    // 本番環境のみ有効。preview は NODE_ENV=production だが VERCEL_ENV=preview なので除外
    // （IS_PRODUCTION では preview を除外できない）。
    enabled: IS_SENTRY_PRODUCTION,

    // Edge のフィルタリング + PII スクラビング
    beforeSend: withPIIScrub(),
    beforeSendTransaction: scrubSentryTransaction,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
}
