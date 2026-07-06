import { DocArticle } from '@/features/docs';
import { getAllContent } from '@/lib/mdx';
import { Link } from '@/platform/i18n/navigation';
import { ContentData } from '@/types/content';
import { Heading, Text } from '@dayopt/components';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

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
  } catch {
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

    return {
      title: `${frontMatter.title} - Dayopt Documentation`,
      description: frontMatter.description,
      authors: frontMatter.author ? [{ name: frontMatter.author }] : undefined,
      openGraph: {
        title: frontMatter.title,
        description: frontMatter.description,
        type: 'article',
        publishedTime: frontMatter.publishedAt,
        modifiedTime: frontMatter.updatedAt,
        authors: frontMatter.author ? [frontMatter.author] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: frontMatter.title,
        description: frontMatter.description,
      },
    };
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
    redirect('/docs');
  }

  const { previousPage, nextPage } = getAdjacentPages(allContent, slug);

  return (
    <DocArticle
      category={matched.frontMatter.category}
      mdxContent={matched.content}
      previousPage={previousPage}
      nextPage={nextPage}
    />
  );
}
