import { Heading, Text } from '@dayopt/components';
import { Link, redirect } from '@dayopt/i18n/navigation';
import { StructuredData } from '@web/components/seo/StructuredData';
import { DocArticle } from '@web/features/docs';
import { getAllContent } from '@web/lib/mdx';
import { generateSEOMetadata } from '@web/platform/seo/metadata';
import { ContentData } from '@web/types/content';
import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface PageParams {
  locale: string;
  slug: string;
}

interface DocPageProps {
  params: Promise<PageParams>;
}

// ISR: ドキュメント記事は1日ごとに再検証
export const revalidate = 86400;

// Generate static parameters (SEO optimization)
export async function generateStaticParams(): Promise<PageParams[]> {
  try {
    const locales = ['en', 'ja'];
    const params: PageParams[] = [];

    for (const locale of locales) {
      const allContent = await getAllContent(locale);
      for (const content of allContent) {
        // getting-started の overview は /docs 自体に統一するため静的生成しない
        if (
          content.frontMatter.category === 'getting-started' &&
          content.slug === 'getting-started'
        ) {
          continue;
        }
        params.push({ locale, slug: content.slug });
      }
    }

    return params;
  } catch (error) {
    // 静かに [] を返すと全 docs が動的レンダリングへ降格するため、原因を必ず出力する
    console.error('[Docs] generateStaticParams failed:', error);
    return [];
  }
}

// Generate metadata
export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  try {
    const { locale, slug } = await params;
    const allContent = await getAllContent(locale);
    const matched = allContent.find((content) => content.slug === slug);

    if (!matched) {
      return {
        title: 'Page Not Found - Dayopt Documentation',
        description: 'The requested documentation page could not be found.',
      };
    }

    const { frontMatter } = matched;

    // hreflang は実際にその言語版が存在するロケールだけを宣言する（片方のみの docs で 404 を指さない）
    const alternateLocales: string[] = [];
    for (const loc of ['en', 'ja']) {
      const content = loc === locale ? allContent : await getAllContent(loc);
      if (content.some((c) => c.slug === slug)) alternateLocales.push(loc);
    }

    // canonical / hreflang を含む共通メタデータ生成（blog 記事と同じ経路）
    return generateSEOMetadata({
      title: `${frontMatter.title} - Dayopt Documentation`,
      description: frontMatter.description,
      url: `/${locale}/docs/${slug}`,
      locale,
      type: 'article',
      publishedTime: frontMatter.publishedAt,
      modifiedTime: frontMatter.updatedAt || frontMatter.publishedAt,
      authors: frontMatter.author ? [frontMatter.author] : undefined,
      section: frontMatter.category,
      alternateLocales,
    });
  } catch {
    return {
      title: 'Documentation - Dayopt',
      description: 'Dayopt documentation and guides',
    };
  }
}

// Get adjacent pages
function getAdjacentPages(
  allContent: ContentData[],
  slug: string,
): {
  previousPage?: ContentData;
  nextPage?: ContentData;
} {
  const currentIndex = allContent.findIndex((content) => content.slug === slug);

  if (currentIndex === -1) {
    return {};
  }

  return {
    previousPage: currentIndex > 0 ? allContent[currentIndex - 1] : undefined,
    nextPage: currentIndex < allContent.length - 1 ? allContent[currentIndex + 1] : undefined,
  };
}

// Main page component
export default async function DocPage({ params }: DocPageProps) {
  const { locale, slug } = await params;
  // 静的レンダリングを有効にする（これがないと動的レンダリングにフォールバックする）
  setRequestLocale(locale);
  const tDocs = await getTranslations('docs');

  let allContent: ContentData[];
  try {
    allContent = await getAllContent(locale);
  } catch {
    // Error page
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Heading as="h1" size="3xl" className="mb-4">
            {tDocs('error.title')}
          </Heading>
          <Text variant="muted" className="mb-6">
            {tDocs('error.description')}
          </Text>
          <Link
            href="/docs"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center rounded-lg px-4 py-2 transition-colors"
          >
            {tDocs('error.backToDocs')}
          </Link>
        </div>
      </div>
    );
  }

  const matched = allContent.find((content) => content.slug === slug);

  if (!matched) {
    notFound();
  }

  // getting-started の overview (index.mdx) は /docs 自体に統一する。
  // /docs/getting-started として直接アクセスされた場合は重複コンテンツを避けるため寄せる。
  if (matched.frontMatter.category === 'getting-started' && matched.slug === 'getting-started') {
    redirect({ href: '/docs', locale });
  }

  const { previousPage, nextPage } = getAdjacentPages(allContent, slug);

  return (
    <>
      {/* 検索エンジン・AI クローラ向けの構造化データ（正本は platform/seo/structured-data.ts）。
          docs は操作手順の記事なので、汎用 Article ではなく TechArticle で出す。 */}
      <StructuredData
        type="techArticle"
        data={{
          title: matched.frontMatter.title,
          description: matched.frontMatter.description,
          publishedAt: matched.frontMatter.publishedAt,
          updatedAt: matched.frontMatter.updatedAt,
          url: `/${locale}/docs/${slug}`,
          proficiencyLevel: matched.frontMatter.ai?.difficulty,
          dependencies: matched.frontMatter.ai?.prerequisites,
        }}
      />
      <DocArticle
        category={matched.frontMatter.category}
        mdxContent={matched.content}
        previousPage={previousPage}
        nextPage={nextPage}
      />
    </>
  );
}
