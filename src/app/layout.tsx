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
    { media: '(prefers-color-scheme: light)', color: '#f8f8f8' },
    { media: '(prefers-color-scheme: dark)', color: '#14110e' },
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
      <head>
        {/* LCP改善: Supabase API への早期接続確立（preconnect + dns-prefetch） */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          </>
        )}
        {/*
         * iOS スプラッシュスクリーン（apple-touch-startup-image）
         *
         * Next.js の Metadata API は apple-touch-startup-image に未対応のため手動指定。
         * 各デバイスの論理解像度 × デバイスピクセル比 = 物理解像度で media クエリを設定。
         *
         * @see https://developer.apple.com/design/human-interface-guidelines/
         * @see https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
         */}
        {/* iPhone 16 Pro Max (430×932 @3x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/splash/splash-1290x2796.png"
        />
        {/* iPhone 16 Pro / 15 Pro (393×852 @3x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/splash/splash-1179x2556.png"
        />
        {/* iPhone 16 Plus / 15 Plus / 14 Plus (430×932 @3x) — same as 16 Pro Max bucket */}
        {/* iPhone 15 / 14 Pro (393×852 @3x) — same as 16 Pro bucket */}
        {/* iPhone 14 (390×844 @3x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/splash/splash-1170x2532.png"
        />
        {/* iPhone SE 3rd gen / 8 / 7 (375×667 @2x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/splash/splash-750x1334.png"
        />
        {/* iPad Pro 12.9" (1024×1366 @2x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/splash/splash-2048x2732.png"
        />
        {/* iPad Pro 11" / Air 5th gen (834×1194 @2x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/splash/splash-1668x2388.png"
        />
        {/* iPad Air 4th gen / iPad mini 6th gen (820×1180 @2x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/splash/splash-1640x2360.png"
        />
        {/* iPad 10th gen (820×1180 @2x) — same bucket as above */}
        {/* iPad 9th gen (768×1024 @2x) */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/splash/splash-1536x2048.png"
        />
      </head>
      <body className={cn('bg-background')} suppressHydrationWarning>
        {/* SSR timezone detection: 2回目以降のSSRで正しいタイムゾーンを使用 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if(!document.cookie.includes('user-tz='))document.cookie='user-tz='+Intl.DateTimeFormat().resolvedOptions().timeZone+';path=/;max-age=31536000;SameSite=Lax';`,
          }}
        />
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
