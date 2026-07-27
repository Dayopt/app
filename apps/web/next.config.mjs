import { assertProductionSentryBuildEnv, failSentryBuild } from '@dayopt/observability/build-gate';
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

import { assertWebOperationalProductionBuildEnv } from './production-build-gate.mjs';
import { buildWebContentSecurityPolicy } from './security-headers.mjs';

const isVercelProduction = assertProductionSentryBuildEnv(process.env, 'Web');
assertWebOperationalProductionBuildEnv(process.env);

function getSentryIngestOrigin(dsn, name) {
  if (!dsn) return undefined;

  try {
    const parsed = new URL(dsn);
    if (parsed.protocol !== 'https:' || !parsed.username) {
      throw new Error('DSN must use HTTPS and include a public key');
    }
    return parsed.origin;
  } catch (error) {
    if (isVercelProduction) {
      throw new Error(`${name} is not a valid Sentry DSN`, { cause: error });
    }
    return undefined;
  }
}

const sentryIngestOrigin = getSentryIngestOrigin(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  'NEXT_PUBLIC_SENTRY_DSN',
);
getSentryIngestOrigin(process.env.SENTRY_DSN, 'SENTRY_DSN');

const withNextIntl = createNextIntlPlugin('./src/platform/i18n/request.ts');

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/**
 * FAQ を `/docs/faq/<slug>` へ階層化する前の旧 slug（2026-07-27）。
 * `content/docs/{en,ja}/faq/*.mdx` の index.mdx 以外と対にする。
 * FAQ ページを追加・改名したらここも更新する。
 */
const FAQ_SLUGS = [
  'comparison',
  'features',
  'general',
  'philosophy',
  'pricing',
  'privacy-security',
  'technical',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || '',
  },

  // セキュリティヘッダー設定
  async headers() {
    // 開発環境では unsafe-eval が必要（Hot Reload用）
    const isDev = process.env.NODE_ENV === 'development';
    const contentSecurityPolicy = buildWebContentSecurityPolicy({
      isDevelopment: isDev,
      sentryIngestOrigin,
    });

    return [
      {
        source: '/(.*)',
        headers: [
          // HSTS（HTTP Strict Transport Security）- MITM攻撃防止
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // CSP（Content Security Policy）
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
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
          // XSS対策（レガシーブラウザ用）
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
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
    ];
  },

  // 削除・移動した公開ページの 301。
  //
  // **実在したページだけを書く。** 2026-07-27 の棚卸しで、/pricing /features /about
  // /changelog の 8 エントリがページとして一度も存在しなかったことを確認して削除した
  // （git log --all --diff-filter=A に追加記録が無く、repo 内からのリンクも 0）。
  // 慣習的な URL を先回りして書くと、実際に消したページ（/releases）の方が漏れる。
  //
  // `:locale` は必ず (en|ja) で制約する。無制約の `/:locale/pricing` は 1 セグメントなら
  // 何にでもマッチするため、`/docs/pricing` の `docs` を locale と誤認して公開中の
  // docs ページを食う（2026-07-27 に本番で /docs/features と /docs/pricing が 308 に
  // なっていたのを確認）。locale の正本は @dayopt/config の SUPPORTED_LOCALES。
  async redirects() {
    return [
      // /releases は実在したページ。712668015 でリリースノートを blog の release
      // カテゴリへ統合した際に廃止され、redirect が無いまま本番で 404 になっていた。
      {
        source: '/releases',
        destination: '/blog/release',
        permanent: true,
      },
      {
        source: '/:locale(en|ja)/releases',
        destination: '/:locale/blog/release',
        permanent: true,
      },
      // FAQ を /docs/faq/<slug> へ階層化した分の旧 URL（2026-07-27）。
      // FAQ は pricing / features のような一般名を docs のグローバル名前空間で
      // 占有してしまい、`/docs/pricing` が料金ページに見えて実際は FAQ という
      // 誤解を生んでいた。経緯は docs/marketing/log/2026-07-27-docs-faq-url-nesting.md
      ...FAQ_SLUGS.flatMap((slug) => [
        {
          source: `/docs/${slug}`,
          destination: `/docs/faq/${slug}`,
          permanent: true,
        },
        {
          source: `/:locale(en|ja)/docs/${slug}`,
          destination: `/:locale/docs/faq/${slug}`,
          permanent: true,
        },
      ]),
    ];
  },

  // Multi-zones設定: LP（web）とアプリ（app）を同一ドメインで運用
  // web側にないパスはapp側（dayopt-app）にフォールバック
  // @see https://nextjs.org/docs/app/building-your-application/deploying/multi-zones
  async rewrites() {
    const appDomain = process.env.APP_DOMAIN || 'https://dayopt-app.vercel.app';

    return {
      // app側のアセットをプロキシ
      beforeFiles: [
        {
          source: '/app-static/:path*',
          destination: `${appDomain}/app-static/:path*`,
        },
      ],
      // web側にないパスをapp側にフォールバック
      fallback: [
        {
          source: '/settings',
          destination: `${appDomain}/settings`,
        },
        {
          source: '/settings/:path*',
          destination: `${appDomain}/settings/:path*`,
        },
        {
          source: '/ja/settings',
          destination: `${appDomain}/ja/settings`,
        },
        {
          source: '/ja/settings/:path*',
          destination: `${appDomain}/ja/settings/:path*`,
        },
      ],
    };
  },

  // Turbopack configuration (default bundler in Next.js 16)
  turbopack: {
    // Turbopack handles optimization automatically
  },

  // ビルド最適化
  compiler: {
    // 本番環境でconsole.log/info/debugを削除、error/warnは残す
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  experimental: {
    // Next.js 15 Router Cache再有効化
    staleTimes: {
      dynamic: 30, // 動的ルート: 30秒キャッシュ
      static: 180, // 静的ルート: 3分キャッシュ
    },
    optimizePackageImports: [
      '@web/components',
      '@web/lib',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'clsx',
      'class-variance-authority',
    ],
  },

  images: {
    formats: ['image/avif', 'image/webp'], // AVIFを優先（より高圧縮）
    minimumCacheTTL: 2592000, // 30日
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
        port: '',
        pathname: '/**',
      },
    ],
  },

  // Simplified webpack configuration
  webpack: (config, { dev, isServer }) => {
    // Add explicit file extensions for better module resolution
    config.resolve.extensions = ['.tsx', '.ts', '.jsx', '.js', '.json'];

    // Only apply optimizations in production
    if (!dev && !isServer) {
      // Enhanced code splitting optimization
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 25,
          maxAsyncRequests: 30,
          cacheGroups: {
            // React and core libs
            vendor: {
              test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
              name: 'vendor',
              chunks: 'all',
              priority: 10,
            },
            // UI library chunk
            ui: {
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|class-variance-authority|clsx|tailwind-merge)[\\/]/,
              name: 'ui',
              chunks: 'all',
              priority: 9,
            },
            // Form libraries
            form: {
              test: /[\\/]node_modules[\\/](@hookform|zod|react-hook-form)[\\/]/,
              name: 'form',
              chunks: 'all',
              priority: 8,
            },
            // MDX and content
            content: {
              test: /[\\/]node_modules[\\/](next-mdx-remote|gray-matter|remark|rehype|web-vitals)[\\/]/,
              name: 'content',
              chunks: 'all',
              priority: 7,
            },
            // Common components chunk
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    return config;
  },

  poweredByHeader: false,
};

const configuredNext = withNextIntl(withBundleAnalyzer(nextConfig));

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  errorHandler: failSentryBuild,
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

// Preview/CI は runtime 送信も release/source map upload も行わない。
export default isVercelProduction
  ? withSentryConfig(configuredNext, sentryBuildOptions)
  : configuredNext;
