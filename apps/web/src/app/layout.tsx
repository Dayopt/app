import { Toaster } from '@dayopt/components';
import { dayoptBrand, dayoptContact } from '@dayopt/config';
import { generateEnhancedMetadata, StructuredData } from '@web/components/seo/EnhancedSEO';
import { cn } from '@web/lib/class-names';
import { ThemeProvider } from '@web/shell/providers/theme-provider';
import type { Metadata } from 'next';
import { Noto_Sans_JP, Source_Sans_3 } from 'next/font/google';
import './globals.css';

// product（apps/product/src/app/layout.tsx）と同一のフォントスタック。
// 変数名は foundations の tokens/typography.css が参照するものに合わせる。
//
// fallback に generic family（sans-serif / system-ui 等）を入れない。next/font は
// fallback の中身を font-family の末尾に連結するため、generic が --font-latin の中に入ると
// stack 上で和文フォントより前に来てしまう。generic を含むシステムフォールバックの尾は
// typography.css 側だけが持つ。
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-latin',
  preload: true,
});

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-noto-jp',
  preload: true,
});

export const metadata: Metadata = generateEnhancedMetadata({
  title: 'Dayopt - Modern SaaS Platform',
  description:
    'Powerful, scalable SaaS platform built with Next.js, React, and Tailwind CSS. Optimized for performance, accessibility, and SEO.',
  keywords: [
    'SaaS platform',
    'Next.js',
    'React',
    'TypeScript',
    'Tailwind CSS',
    'Web application',
    'Modern development',
    'Performance optimization',
  ],
  type: 'website',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sourceSans.variable} ${notoSansJP.variable}`}
    >
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Dayopt Blog"
          href="/blog/feed.xml"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Dayopt ブログ"
          hrefLang="ja"
          href="/ja/blog/feed.xml"
        />
        <StructuredData
          type="Organization"
          data={{
            name: dayoptBrand.name,
            alternateName: dayoptBrand.platformName,
            description: 'Modern SaaS platform for businesses',
            foundingDate: '2024-01-01',
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer service',
              email: dayoptContact.contactEmail,
            },
          }}
        />
        <StructuredData
          type="WebSite"
          data={{
            name: dayoptBrand.platformName,
            alternateName: dayoptBrand.name,
          }}
        />
        <StructuredData
          type="SoftwareApplication"
          data={{
            name: dayoptBrand.name,
            description: 'Plan, execute, and reflect — a simple cycle to optimize your day.',
            applicationCategory: 'ProductivityApplication',
            operatingSystem: 'Web',
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: '0',
              highPrice: '5',
              priceCurrency: 'USD',
              offerCount: 2,
            },
          }}
        />
      </head>
      <body className={cn('bg-background antialiased')} suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
