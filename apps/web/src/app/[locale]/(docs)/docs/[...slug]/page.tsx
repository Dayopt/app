import { DocArticle } from '@/features/docs';
import { getAllContent, getMDXContentForRSC } from '@/lib/mdx';
import { Link } from '@/platform/i18n/navigation';
import { ContentData } from '@/types/content';
import { Heading, Text } from '@dayopt/components';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface PageParams {
  locale: string;
  slug: string[];
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
        params.push({
          locale,
          slug: content.slug.split('/'),
        });
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
    const category = slug[0];
    const contentSlug = slug.slice(1).join('/');

    const content = await getMDXContentForRSC(`${category}/${contentSlug}`, locale);

    if (!content) {
      return {
        title: 'Page Not Found - Dayopt Documentation',
        description: 'The requested documentation page could not be found.',
      };
    }

    const { frontMatter } = content;

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
async function getAdjacentPages(
  slug: string,
  locale?: string,
): Promise<{
  previousPage?: ContentData;
  nextPage?: ContentData;
}> {
  try {
    const allContent = await getAllContent(locale);
    const currentIndex = allContent.findIndex((content) => content.slug === slug);

    if (currentIndex === -1) {
      return {};
    }

    return {
      previousPage: currentIndex > 0 ? allContent[currentIndex - 1] : undefined,
      nextPage: currentIndex < allContent.length - 1 ? allContent[currentIndex + 1] : undefined,
    };
  } catch {
    return {};
  }
}

// Main page component
export default async function DocPage({ params }: DocPageProps) {
  const { locale, slug: slugArray } = await params;
  const tDocs = await getTranslations('docs');

  try {
    const slug = slugArray.join('/');
    const category = slugArray[0] ?? '';
    const contentSlug = slugArray.slice(1).join('/');

    // Get MDX content
    let content;

    // First try with complete slug
    content = await getMDXContentForRSC(slug, locale);

    // If not found, try other patterns
    if (!content && contentSlug) {
      // Category/file format
      content = await getMDXContentForRSC(`${category}/${contentSlug}`, locale);
    }

    if (!content && !contentSlug && category) {
      // Single file format
      content = await getMDXContentForRSC(category, locale);
    }

    if (!content) {
      notFound();
    }

    const { content: mdxContent, frontMatter } = content;
    const { previousPage, nextPage } = await getAdjacentPages(slug, locale);

    return (
      <DocArticle
        slug={slug}
        category={category}
        contentSlug={contentSlug}
        mdxContent={mdxContent}
        frontMatter={frontMatter}
        locale={locale}
        previousPage={previousPage}
        nextPage={nextPage}
      />
    );
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
}
