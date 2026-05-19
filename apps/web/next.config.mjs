import bundleAnalyzer from '@next/bundle-analyzer'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/platform/i18n/request.ts')

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // セキュリティヘッダー設定
  async headers() {
    // 開発環境では unsafe-eval が必要（Hot Reload用）
    const isDev = process.env.NODE_ENV === 'development'
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com"
      : "script-src 'self' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com"

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
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://vercel.live https://vitals.vercel-insights.com",
              "frame-src 'self' https://vercel.live",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
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
    ]
  },

  // 旧ページ → ホームページセクションへ301リダイレクト
  async redirects() {
    return [
      {
        source: '/pricing',
        destination: '/#pricing',
        permanent: true,
      },
      {
        source: '/:locale/pricing',
        destination: '/:locale/#pricing',
        permanent: true,
      },
      {
        source: '/features',
        destination: '/#features',
        permanent: true,
      },
      {
        source: '/:locale/features',
        destination: '/:locale/#features',
        permanent: true,
      },
      {
        source: '/about',
        destination: '/',
        permanent: true,
      },
      {
        source: '/:locale/about',
        destination: '/:locale',
        permanent: true,
      },
      {
        source: '/changelog',
        destination: '/releases',
        permanent: true,
      },
      {
        source: '/:locale/changelog',
        destination: '/:locale/releases',
        permanent: true,
      },
    ]
  },

  // Multi-zones設定: LP（web）とアプリ（app）を同一ドメインで運用
  // web側にないパスはapp側（dayopt-app）にフォールバック
  // @see https://nextjs.org/docs/app/building-your-application/deploying/multi-zones
  async rewrites() {
    const appDomain = process.env.APP_DOMAIN || 'https://dayopt-app.vercel.app'

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
    }
  },

  // Turbopack configuration (default bundler in Next.js 16)
  turbopack: {
    // Turbopack handles optimization automatically
  },

  // ビルド最適化
  compiler: {
    // 本番環境でconsole.log/info/debugを削除、error/warnは残す
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  experimental: {
    // Turbopack TLS証明書設定（Google Fonts等の外部リソース取得用）
    turbopackUseSystemTlsCerts: true,
    // Next.js 15 Router Cache再有効化
    staleTimes: {
      dynamic: 30, // 動的ルート: 30秒キャッシュ
      static: 180, // 静的ルート: 3分キャッシュ
    },
    optimizePackageImports: [
      '@/components',
      '@/lib',
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
    config.resolve.extensions = ['.tsx', '.ts', '.jsx', '.js', '.json']

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
      }
    }

    return config
  },

  poweredByHeader: false,
}

export default withNextIntl(withBundleAnalyzer(nextConfig))
