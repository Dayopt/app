import { FAQStructuredData } from '@/components/seo/EnhancedSEO';
import { TagPill } from '@/components/ui/tag-pill';
import { Breadcrumbs, ClientTableOfContents, mdxComponents, PageNavigation } from '@/features/docs';
import { faqMdxComponents } from '@/features/docs/components/MDXComponents';
import { getAllContent, getMDXContentForRSC, getRelatedContent } from '@/lib/mdx';
import { Link } from '@/platform/i18n/navigation';
import { ContentData } from '@/types/content';
import { Card, CardHeader, CardTitle, Heading, Text } from '@dayopt/components';
import { Tag } from 'lucide-react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

/**
 * MDXソースからFAQ（h2 = 質問、本文 = 回答）を抽出
 */
function extractFAQsFromMDX(content: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  const lines = content.split('\n');
  let currentQuestion = '';
  let currentAnswer = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentQuestion && currentAnswer) {
        faqs.push({ question: currentQuestion, answer: currentAnswer.trim() });
      }
      currentQuestion = line.replace('## ', '');
      currentAnswer = '';
    } else if (currentQuestion && line.trim()) {
      currentAnswer += line + ' ';
    }
  }
  if (currentQuestion && currentAnswer) {
    faqs.push({ question: currentQuestion, answer: currentAnswer.trim() });
  }
  return faqs;
}

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
      keywords: frontMatter.tags?.join(', '),
      authors: frontMatter.author ? [{ name: frontMatter.author }] : undefined,
      openGraph: {
        title: frontMatter.title,
        description: frontMatter.description,
        type: 'article',
        publishedTime: frontMatter.publishedAt,
        modifiedTime: frontMatter.updatedAt,
        tags: frontMatter.tags,
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
    const category = slugArray[0];
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

    // Get adjacent pages and related content in parallel
    const [{ previousPage, nextPage }, relatedContent] = await Promise.all([
      getAdjacentPages(slug, locale),
      getRelatedContent(frontMatter.category, slug, 3, locale),
    ]);

    return (
      <div className="flex">
        {/* Main Content */}
        <div className="min-w-0 flex-1 px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-3xl">
            {/* Breadcrumb navigation */}
            <Breadcrumbs slug={slug} title={frontMatter.title} />

            {/* FAQ構造化データ（FAQサブページのみ） */}
            {category === 'faq' &&
              contentSlug &&
              (() => {
                const faqs = extractFAQsFromMDX(mdxContent);
                return faqs.length > 0 ? <FAQStructuredData faqs={faqs} /> : null;
              })()}

            {/* MDX content */}
            <article>
              <MDXRemote
                source={mdxContent}
                components={category === 'faq' && contentSlug ? faqMdxComponents : mdxComponents}
                options={{
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                    rehypePlugins: [rehypeHighlight],
                  },
                }}
              />
            </article>

            {/* Tags section */}
            {frontMatter.tags && frontMatter.tags.length > 0 && (
              <aside className="border-border mt-12 border-t pt-8">
                <div className="mb-4 flex items-center gap-2">
                  <Tag className="text-muted-foreground size-4" />
                  <span className="text-muted-foreground text-sm font-medium">{tDocs('tags')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {frontMatter.tags.map((tag) => (
                    <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
                      <TagPill tag={tag} />
                    </Link>
                  ))}
                </div>
              </aside>
            )}

            {/* Related content */}
            {relatedContent.length > 0 && (
              <aside className="border-border mt-12 border-t pt-8">
                <Heading as="h2" size="xl" className="mb-6">
                  {tDocs('relatedArticles')}
                </Heading>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedContent.map((related) => (
                    <Link key={related.slug} href={`/docs/${related.slug}`} className="block">
                      <Card className="hover:bg-state-hover h-full gap-4 py-4 transition-colors">
                        <CardHeader className="gap-2 px-4 py-0">
                          <CardTitle className="line-clamp-2 text-sm">
                            {related.frontMatter.title}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            {related.frontMatter.updatedAt && (
                              <time className="text-muted-foreground text-xs">
                                {new Date(related.frontMatter.updatedAt).toLocaleDateString(locale)}
                              </time>
                            )}
                            {related.frontMatter.tags && related.frontMatter.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {related.frontMatter.tags.slice(0, 2).map((tag) => (
                                  <TagPill key={tag} tag={tag} />
                                ))}
                              </div>
                            )}
                          </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </aside>
            )}

            {/* Previous/next page navigation */}
            <PageNavigation previousPage={previousPage} nextPage={nextPage} />
          </div>
        </div>

        {/* Right Sidebar - Table of Contents (xl以上で表示、固定位置) */}
        <aside className="hidden w-60 flex-shrink-0 xl:block">
          <div className="sticky top-0 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-8">
            <ClientTableOfContents content={mdxContent} />
          </div>
        </aside>
      </div>
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
