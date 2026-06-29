import { FilteredBlogClient, getAllBlogPostMetas } from '@/features/blog';
import { routing } from '@/platform/i18n/routing';
import { generateSEOMetadata } from '@/platform/seo/metadata';
import { Container } from '@dayopt/components';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// ISR: ブログ一覧は1時間ごとに再検証
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return generateSEOMetadata({
    title: t('navigation.blog'),
    description: locale === 'ja' ? '最新の記事とチュートリアル' : 'Latest articles and tutorials',
    url: `/${locale}/blog`,
    locale: locale,
    keywords:
      locale === 'ja'
        ? ['ブログ', '記事', 'SaaS', '開発', '技術', 'Next.js', 'TypeScript']
        : ['blog', 'articles', 'SaaS', 'development', 'technology', 'Next.js', 'TypeScript'],
    type: 'website',
  });
}

export default async function BlogPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const allPosts = await getAllBlogPostMetas(locale);

  return (
    <div className="bg-background min-h-screen">
      <section className="py-16">
        <Container>
          <div className="mx-auto max-w-6xl">
            <FilteredBlogClient initialPosts={allPosts} locale={locale} />
          </div>
        </Container>
      </section>
    </div>
  );
}
