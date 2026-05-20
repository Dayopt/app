/**
 * Sentry クライアントサイド設定
 *
 * ブラウザでのエラー監視・パフォーマンス監視・Session Replayを設定。
 * Next.js 15では自動的に読み込まれます。
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */

import * as Sentry from '@sentry/nextjs';
import { createBrowserClient } from '@supabase/ssr';

import { withPIIScrub } from '@/lib/sentry/scrub-pii';

// ナビゲーション計測用フック（Sentry SDK が要求）
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * GDPR対応: Cookie同意確認
 * 分析Cookieの同意がある場合のみSentryを有効化
 */
function isAnalyticsConsented(): boolean {
  // サーバーサイドでは常に許可（このファイルはクライアント専用だが念のため）
  if (typeof window === 'undefined') {
    return true;
  }

  // 開発環境では同意チェックをスキップ
  if (!IS_PRODUCTION) {
    return true;
  }

  // ブラウザでCookie同意を確認
  try {
    const consent = localStorage.getItem('dayopt_cookie_consent');
    if (!consent) return false;

    const parsed = JSON.parse(consent);
    return parsed.analytics === true;
  } catch {
    return false;
  }
}

/**
 * Sentry初期化（一度だけ実行）
 */
function initSentry(dsn: string) {
  Sentry.init({
    dsn,
    environment: VERCEL_ENV,
    ...(process.env.NEXT_PUBLIC_APP_VERSION && { release: process.env.NEXT_PUBLIC_APP_VERSION }),

    // サンプリングレート（環境別）
    tracesSampleRate: IS_PRODUCTION ? 0.1 : VERCEL_ENV === 'preview' ? 0.5 : 1.0,

    // Session Replay設定
    // エラー発生時: 100%キャプチャ（問題再現用）
    // 通常時: 0%（コスト削減）
    replaysOnErrorSampleRate: IS_PRODUCTION ? 1.0 : 0,
    replaysSessionSampleRate: 0,

    // デバッグモード（開発環境のみ）
    debug: !IS_PRODUCTION && process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true',

    // 本番・プレビュー環境のみ有効
    enabled: IS_PRODUCTION || VERCEL_ENV === 'preview',

    // エラーフィルタリング + PII スクラビング
    // withPIIScrub は exception message / URL / breadcrumbs / contexts など
    // 全フィールドを walk して PII を redact する
    beforeSend: withPIIScrub((event) => {
      const errorMessage = event.exception?.values?.[0]?.value || '';

      // ブラウザ拡張機能・サードパーティスクリプト・ネットワーク系のノイズを除外
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

      // 開発環境のノイズ除去
      if (!IS_PRODUCTION) {
        const devIgnoredPatterns = ['HMR', 'Unexpected token', 'Network Error'];

        if (devIgnoredPatterns.some((pattern) => errorMessage.includes(pattern))) {
          return null;
        }
      }

      return event;
    }),

    // クライアントサイド用インテグレーション
    integrations: [
      // パフォーマンス監視（INP計測含む）
      Sentry.browserTracingIntegration({
        enableInp: true,
      }),

      // Session Replay は init 後に動的読み込み（下記参照）

      // Supabase操作（auth, DB）の自動計測
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? [
            Sentry.supabaseIntegration({
              supabaseClient: createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
              ),
            }),
          ]
        : []),
    ],
  });

  // Session Replay を動的読み込み（初期バンドルから-127KB削減）
  // replaysOnErrorSampleRate/replaysSessionSampleRate は init で設定済み
  import('@sentry/nextjs').then((lazyLoadedSentry) => {
    Sentry.addIntegration(
      lazyLoadedSentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    );
  });

  // プラットフォームタグ: PWA（standalone）か通常ブラウザかを識別
  if (typeof window !== 'undefined') {
    const isPwa = window.matchMedia('(display-mode: standalone)').matches;
    Sentry.setTag('app.platform', isPwa ? 'pwa' : 'web');
  }
}

// DSNが設定されている場合のみ処理
if (SENTRY_DSN) {
  if (isAnalyticsConsented()) {
    // 同意済み: 即座に初期化
    initSentry(SENTRY_DSN);
  } else if (typeof window !== 'undefined' && IS_PRODUCTION) {
    // 本番環境で未同意: Cookie同意バナーからの同意イベントを待機
    const dsn = SENTRY_DSN;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.analytics === true) {
        initSentry(dsn);
        window.removeEventListener('cookieConsentChanged', handler);
      }
    };
    window.addEventListener('cookieConsentChanged', handler);
  }
}
