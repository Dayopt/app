import { HeroSection, HowSection, PricingSection } from '@/features/marketing';
import { routing } from '@/platform/i18n/routing';
import { generateSEOMetadata } from '@/platform/seo/metadata';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// ISR: マーケティングページは1時間ごとに再検証
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'marketing' });

  return generateSEOMetadata({
    title: t('hero.title'),
    description: t('hero.subtitle'),
    url: `/${locale}`,
    locale: locale,
    keywords:
      locale === 'ja'
        ? ['タイムボクシング', '時間管理', '生産性', '振り返り', 'カレンダー']
        : ['timeboxing', 'time management', 'productivity', 'reflection', 'calendar'],
    type: 'website',
  });
}

export default async function Home({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-background">
      <div className="relative isolate">
        {/* Hero Section */}
        <HeroSection locale={locale} />

        {/* How Section */}
        <HowSection locale={locale} />

        {/* Pricing Section */}
        <PricingSection locale={locale} />
      </div>
    </div>
  );
}
