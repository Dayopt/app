/**
 * ルートレイアウト
 *
 * @description
 * 最小限の責務のみを持つルートレイアウト。
 * Providersは各Route Groupのレイアウトで適用する。
 *
 * 責務:
 * - グローバルCSS読み込み
 * - フォント設定（Inter, Noto Sans JP）
 * - HTML/body構造
 * - Vercel Analytics/SpeedInsights
 *
 * @see src/app/[locale]/(app)/layout.tsx - 認証必須ページ用Providers
 * @see src/app/[locale]/(auth)/layout.tsx - 認証ページ用Providers
 * @see src/app/[locale]/legal/layout.tsx - 法的文書用Providers
 */
import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_JP } from 'next/font/google';
import { Suspense } from 'react';

import { cn } from '@/lib/utils';
import { DeferredAnalytics } from '@/platform/analytics/DeferredAnalytics';
import { WebVitalsReporter } from '@/platform/sentry/WebVitalsReporter';

// next/font による最適化されたフォント読み込み（Variable Font: optical size軸有効）
// preload: true でLCP改善（デフォルトでtrueだが明示的に指定）
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  axes: ['opsz'],
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
});

// 日本語フォント（GAFA方針準拠: Google = Noto Sans JP）
// weight: 400, 700のみ（500削減で5-10KB軽量化）- font-normalは400でフォールバック
const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-noto-jp',
  preload: true,
  fallback: ['Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'sans-serif'],
});

/**
 * Viewport設定（モバイルUX最適化）
 *
 * @see https://developer.apple.com/design/human-interface-guidelines/
 * @see https://css-tricks.com/the-notch-and-css/
 *
 * - viewportFit: 'cover' → iPhone X以降のノッチ/Dynamic Island対応
 * - themeColor → ステータスバーの色（ライト/ダークモード対応）
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
};

/**
 * メタデータ設定（PWA・SEO最適化）
 *
 * @see https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
 */
export const metadata: Metadata = {
  title: {
    template: '%s - Dayopt',
    default: 'Dayopt',
  },
  description: 'Dayopt - Task management and productivity application',
  // iOS PWA設定（Apple Human Interface Guidelines準拠）
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dayopt',
  },
  // Android PWA向け追加設定
  applicationName: 'Dayopt',
  formatDetection: {
    telephone: false,
  },
  // PWAマニフェスト参照
  manifest: '/manifest.json',
  // アイコン設定（iOS/Android/デスクトップ対応）
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS用アイコン（Safari Home Screen対応）
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale?: string }>;
}

const RootLayout = async ({ children, params }: RootLayoutProps) => {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale || 'en';
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${notoSansJP.variable}`}
    >
      <body className={cn('bg-background')} suppressHydrationWarning>
        <Suspense fallback={null}>
          {children}
          <WebVitalsReporter />
          {/* LCP/TBT改善: Analyticsを遅延読み込み（-300ms/-150ms） */}
          <DeferredAnalytics />
        </Suspense>
      </body>
    </html>
  );
};

export default RootLayout;
