import { withSentryConfig } from '@sentry/nextjs'
import bundleAnalyzer from '@next/bundle-analyzer'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts')

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Multi-zones設定: LP（web）とアプリ（app）を同一ドメインで運用
  // @see https://nextjs.org/docs/app/building-your-application/deploying/multi-zones
  assetPrefix: process.env.NODE_ENV === 'production' ? '/app-static' : undefined,

  // セキュリティ: X-Powered-By ヘッダーを削除（サーバー情報漏洩防止）
  poweredByHeader: false,

  // 環境変数設定
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '0.0.0',
  },

  // TypeScript設定
  typescript: {
    ignoreBuildErrors: false,
  },

  // Multi-zones用リライト設定
  // assetPrefixで設定したパスを実際の_nextパスにリライト
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/app-static/_next/:path*',
          destination: '/_next/:path*',
        },
      ],
    }
  },

  // セキュリティヘッダー設定
  async headers() {
    // 開発環境ではローカルSupabaseへの接続を許可
    const isDevelopment = process.env.NODE_ENV === 'development'
    const connectSrc = [
      "'self'",
      'https://*.supabase.co',
      'https://vercel.live',
      'wss://*.supabase.co',
      'https://vitals.vercel-insights.com',
      'https://api.pwnedpasswords.com', // Have I Been Pwned API
      // Sentry エラー監視・パフォーマンス監視
      'https://*.sentry.io',
      'https://*.ingest.sentry.io',
      ...(isDevelopment ? ['http://127.0.0.1:54321', 'http://localhost:54321'] : []),
    ].join(' ')

    return [
      {
        source: '/(.*)',
        headers: [
          // HSTS（HTTP Strict Transport Security）- MITM攻撃防止
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // CSP（Content Security Policy）- 強化モード（2025-10-20より有効化）
          // NOTE: 'unsafe-eval' / 'unsafe-inline' が必要な理由:
          // - 'unsafe-eval': Next.js開発モードのHMR、一部ライブラリの動的コード評価
          // - 'unsafe-inline': shadcn/ui, Radix UI, Tailwind CSSのインラインスタイル
          // TODO: 将来的にnonce-based CSPへの移行を検討（Next.js 15.xでのサポート改善後）
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 開発環境では'unsafe-eval'が必要、本番では可能な限り制限
              isDevelopment
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com https://www.google.com https://www.gstatic.com"
                : "script-src 'self' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com https://www.google.com https://www.gstatic.com",
              // NOTE: 'unsafe-inline'はshadcn/ui, Radix UIで必要
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "frame-src 'self' https://vercel.live https://www.google.com https://recaptcha.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
              'report-uri /api/csp-report',
            ].join('; '),
          },
          // Clickjacking対策
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // MIME type sniffing防止
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // XSS対策: CSPに完全移行のため無効化（'1; mode=block'はChrome 78+で削除済み、
          // 一部ケースでバイパスに利用される可能性があるためMDN推奨に従い0に設定）
          {
            key: 'X-XSS-Protection',
            value: '0',
          },
          // リファラー情報制御
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // ブラウザAPI使用制限
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      // 静的ファイルのキャッシュ設定
      {
        source: '/robots.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/sitemap.xml',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // アイコン・マニフェスト等の静的アセット（1年キャッシュ）
      {
        source: '/:path(icons/icon-*.png|icons/apple-touch-icon.png|manifest.json)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // OG画像（1ヶ月キャッシュ）
      {
        source: '/og-image.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
          },
        ],
      },
      // フォントファイル（1年キャッシュ）
      {
        source: '/:path*.woff2',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // 画像最適化設定
  // Vercelデプロイ時はVercel側で画像最適化が行われるためsharp不要
  // ローカル開発時はomit=optional(.npmrc)によりsharpをスキップ
  images: {
    formats: ['image/avif', 'image/webp'], // AVIFを優先（より高圧縮）
    minimumCacheTTL: 2592000, // 30日（画像は変更頻度が低い）
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'yvglwblxrnrenfifsnje.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // 実験的機能
  experimental: {
    // React Compiler: 現在無効化
    // next-intlのコンテキスト伝播と干渉するため、互換性が解決されるまで無効化
    // @see https://github.com/amannn/next-intl/issues
    // reactCompiler: true,

    // Partial Prerendering（PPR）- 現在無効化
    // Next.js canary版でのみ利用可能なため、stable版では無効化
    // TODO: Next.js 16以降でstableになったら再有効化を検討
    // @see https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering
    // ppr: 'incremental',

    // Next.js 15 Router Cache再有効化（デフォルトで無効化された）
    // ページ遷移パフォーマンス向上のため、クライアント側キャッシュを有効化
    // @see https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes
    staleTimes: {
      dynamic: 30, // 動的ルート: 30秒キャッシュ（[locale]等）
      static: 180, // 静的ルート: 3分キャッシュ
    },
    optimizePackageImports: [
      // アイコン
      'lucide-react',
      '@radix-ui/react-icons',
      // Radix UI コンポーネント
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-tooltip',
      // ユーティリティ
      'date-fns',
      'motion',
      'recharts',
      'clsx',
      'class-variance-authority',
    ],
  },

  // ビルド最適化
  compiler: {
    // GAFAベストプラクティス: 本番環境でconsole.log/info/debugを削除
    // error/warnは残す（エラー監視のため）
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
}

/**
 * Sentry設定オプション
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
const sentryOptions = {
  // ソースマップアップロード（ビルド時）
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // ソースマップ設定
  sourcemaps: {
    // ソースマップを自動削除（本番環境でソースコード露出防止）
    deleteSourcemapsAfterUpload: true,
  },

  // ビルドログ制御
  silent: !process.env.CI, // CI環境以外ではログを抑制
  disableLogger: true, // Sentryロガーを無効化

  // パフォーマンス最適化
  widenClientFileUpload: true, // クライアントファイルのアップロード範囲拡大

  // Next.js固有設定
  hideSourceMaps: true, // 本番環境でソースマップを非公開
  // NOTE: tunnelRouteは削除済み - CSPヘッダーでSentryドメインを許可しているため不要
  // tunnelRoute有効時、ルートハンドラーが自動生成されない問題でイベントが失われていた
}

// withNextIntl → withBundleAnalyzer → withSentryConfig の順で適用
// 重要: Sentryが最後に適用されるようにする
export default withSentryConfig(withBundleAnalyzer(withNextIntl(nextConfig)), sentryOptions)
