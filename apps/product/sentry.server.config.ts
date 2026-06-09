/**
 * Sentry サーバーサイド設定（Node.jsランタイム）
 *
 * このファイルはサーバーサイドでのエラー監視を設定します。
 * instrumentation.ts から動的にインポートされます。
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';

import { withPIIScrub } from '@/lib/sentry/scrub-pii';

// サーバーサイドではSENTRY_DSNを優先（ランタイム環境変数）
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
// VERCEL_ENVはVercelが自動設定（production, preview, development）
const VERCEL_ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// DSNが設定されている場合のみ初期化
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: VERCEL_ENV,
    // release は withSentryConfig が build 時に注入する（Vercel env SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA）。
    // ここで明示すると source map upload 時の release と runtime がズレるため上書きしない。

    // サンプリングレート（環境別）
    // Production: 10%（コスト最適化）
    // Preview: 50%（テスト用）
    // Development: 100%（デバッグ用）
    tracesSampleRate: IS_PRODUCTION ? 0.1 : VERCEL_ENV === 'preview' ? 0.5 : 1.0,

    // プロファイリング（本番のみ）
    profilesSampleRate: IS_PRODUCTION ? 0.1 : 0,

    // デバッグモード（開発環境のみ）
    debug: !IS_PRODUCTION && process.env.SENTRY_DEBUG === 'true',

    // 本番環境のみ有効（preview は signal を汚すため送信しない）
    enabled: IS_PRODUCTION,

    // エラーフィルタリング + PII スクラビング
    // withPIIScrub は exception message / URL / breadcrumbs / contexts など
    // 全フィールドを walk して PII を redact する
    beforeSend: withPIIScrub((event) => {
      // 開発環境のノイズ除去
      if (!IS_PRODUCTION) {
        const errorMessage = event.exception?.values?.[0]?.value || '';

        // 無視するエラーパターン
        const ignoredPatterns = [
          'ECONNREFUSED', // ローカルDB接続エラー
          'ENOTFOUND', // DNS解決エラー
          'Module not found', // ビルド時エラー
        ];

        if (ignoredPatterns.some((pattern) => errorMessage.includes(pattern))) {
          return null;
        }
      }

      return event;
    }),

    // サーバーサイド用インテグレーション
    integrations: [
      // tRPC統合（エラーコンテキスト強化）
      Sentry.extraErrorDataIntegration({
        depth: 5,
      }),
      // Supabase操作（auth, DB）の自動計測
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? [
            Sentry.supabaseIntegration({
              supabaseClient: createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
              ),
            }),
          ]
        : []),
    ],
  });
}
