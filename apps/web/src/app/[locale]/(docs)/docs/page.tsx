import { Heading, Text } from '@/components/ui/typography';
import { Link } from '@/platform/i18n/navigation';
import { routing } from '@/platform/i18n/routing';
import { generateSEOMetadata } from '@/platform/seo/metadata';
import { generateDocsNavigation } from '@/shell/navigation';
import { BookOpen, Code, FileText, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// ISR: ドキュメントは1日ごとに再検証
export const revalidate = 86400;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return generateSEOMetadata({
    title: t('navigation.docs'),
    description: t('navigation.docsDescription'),
    url: `/${locale}/docs`,
    locale: locale,
    keywords:
      locale === 'ja'
        ? ['ドキュメント', 'API', 'ガイド', 'チュートリアル', 'SaaS', '開発']
        : ['documentation', 'API', 'guides', 'tutorials', 'SaaS', 'development'],
    type: 'website',
  });
}

export default async function DocsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tDocs = await getTranslations({ locale, namespace: 'docs' });

  const navigation = generateDocsNavigation();

  const quickStartCards = [
    {
      icon: <Zap className="text-primary size-6" />,
      title: tDocs('landing.quickStart.title'),
      description: tDocs('landing.quickStart.description'),
      link: tDocs('landing.quickStart.link'),
      href: '/docs/getting-started/quick-start',
    },
    {
      icon: <Code className="text-success size-6" />,
      title: tDocs('landing.apiReference.title'),
      description: tDocs('landing.apiReference.description'),
      link: tDocs('landing.apiReference.link'),
      href: '/docs/api',
    },
    {
      icon: <BookOpen className="text-info size-6" />,
      title: tDocs('landing.guides.title'),
      description: tDocs('landing.guides.description'),
      link: tDocs('landing.guides.link'),
      href: '/docs/guides',
    },
  ];

  return (
    <div className="space-y-12 px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-12">
        {/* Header Section */}
        <div className="space-y-4">
          <Heading as="h1" size="4xl" className="text-foreground">
            {tCommon('navigation.docs')}
          </Heading>
          <Text size="xl" variant="muted" className="max-w-3xl">
            {tDocs('landing.subtitle')}
          </Text>
        </div>

        {/* Quick Start Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {quickStartCards.map((card) => (
            <div
              key={card.href}
              className="border-border bg-card hover:border-foreground rounded-lg border p-6 transition-colors"
            >
              <div className="mb-4 flex items-center space-x-4">
                <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                  {card.icon}
                </div>
                <Heading as="h3" size="lg">
                  {card.title}
                </Heading>
              </div>
              <Text variant="muted" className="mb-4">
                {card.description}
              </Text>
              <Link href={card.href} className="text-primary hover:text-primary/80 font-medium">
                {card.link}
              </Link>
            </div>
          ))}
        </div>

        {/* ドキュメント一覧 */}
        <div className="space-y-8">
          {navigation.map((section) => (
            <div key={section.title}>
              <Heading as="h2" size="xl" className="text-foreground mb-4">
                {section.title}
              </Heading>
              <div className="divide-border divide-y">
                {section.items.map((item) =>
                  item.href ? (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="hover:bg-state-hover flex items-center gap-4 py-3 transition-colors"
                    >
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <span className="text-foreground text-sm">{item.title}</span>
                    </Link>
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
