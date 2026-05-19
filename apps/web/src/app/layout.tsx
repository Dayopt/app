import { generateEnhancedMetadata, StructuredData } from '@/components/seo/EnhancedSEO';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/shell/providers/theme-provider';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
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
            name: 'Dayopt',
            alternateName: 'Dayopt Platform',
            description: 'Modern SaaS platform for businesses',
            foundingDate: '2024-01-01',
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer service',
              email: 'contact@dayopt.app',
            },
          }}
        />
        <StructuredData
          type="WebSite"
          data={{
            name: 'Dayopt Platform',
            alternateName: 'Dayopt',
          }}
        />
        <StructuredData
          type="SoftwareApplication"
          data={{
            name: 'Dayopt',
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
