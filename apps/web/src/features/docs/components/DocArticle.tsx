import { FAQStructuredData } from '@/components/seo/EnhancedSEO';
import { getRelatedContent } from '@/lib/mdx';
import { Link } from '@/platform/i18n/navigation';
import { ContentData, FrontMatter } from '@/types/content';
import { Card, CardHeader, CardTitle, Heading } from '@dayopt/components';
import { getTranslations } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Breadcrumbs } from './Breadcrumbs';
import { faqMdxComponents, mdxComponents } from './MDXComponents';
import { PageNavigation } from './PageNavigation';
import { TableOfContentsCards } from './TableOfContentsCards';

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

interface DocArticleProps {
  /** URL 由来の slug（例: 'getting-started', 'faq/pricing'） */
  slug: string;
  category: string;
  contentSlug: string;
  mdxContent: string;
  frontMatter: FrontMatter;
  locale: string;
  previousPage?: ContentData;
  nextPage?: ContentData;
}

/**
 * docs 記事の本文 + パンくず + 関連記事 + ページ送り + 右側目次（blog と共通の2card）を描画する。
 * `/docs/[...slug]` と `/docs`（はじめに Overview をデフォルト表示）の両方から使う。
 */
export async function DocArticle({
  slug,
  category,
  contentSlug,
  mdxContent,
  frontMatter,
  locale,
  previousPage,
  nextPage,
}: DocArticleProps) {
  const tDocs = await getTranslations('docs');
  const relatedContent = await getRelatedContent(frontMatter.category, slug, 3, locale);

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

      {/* Right Sidebar - Table of Contents（xl以上で表示。blog と共通の2card レイアウト） */}
      <aside className="hidden w-72 flex-shrink-0 xl:block">
        <div className="sticky top-14 py-8 pr-6 lg:pr-8">
          <TableOfContentsCards content={mdxContent} />
        </div>
      </aside>
    </div>
  );
}
