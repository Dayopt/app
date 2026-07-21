import { Toaster } from '@dayopt/components';
import { dayoptBrand, dayoptContact } from '@dayopt/config';
import { generateEnhancedMetadata, StructuredData } from '@web/components/seo/EnhancedSEO';
import { cn } from '@web/lib/class-names';
import { ThemeProvider } from '@web/shell/providers/theme-provider';
import type { Metadata } from 'next';
import './globals.css';

// NOTE: Google Fonts アクセスが制限されているビルド環境向けに一時的にシステムフォントを使用
// 本番環境では next/font/google を使用することを推奨
// TODO: ビルド環境でGoogle Fontsアクセスが可能になったら next/font/google に戻す

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Dayopt Blog"
          href="/blog/feed.xml"
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
