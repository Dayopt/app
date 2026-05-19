import { createMDXComponents } from '@/components/content/ContentMDXComponents';
import { Container } from '@/components/ui/container';
import { TagPill } from '@/components/ui/tag-pill';
import {
  RelatedPosts,
  ShareButton,
  getAllBlogPostMetas,
  getBlogPost,
  getRelatedPosts,
} from '@/features/blog';
import { ClientTableOfContents } from '@/features/docs';
import { Link } from '@/platform/i18n/navigation';
import { routing } from '@/platform/i18n/routing';
import { generateSEOMetadata } from '@/platform/seo/metadata';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MDXRemote } from 'next-mdx-remote/rsc';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

interface BlogPostPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

// Blog-specific: Callout component
function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'error' | 'success';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'bg-muted border-info text-info',
    warning: 'bg-muted border-warning text-warning',
    error: 'bg-muted border-destructive text-destructive',
    success: 'bg-muted border-success text-success',
  };

  const icons = {
    info: '\u{1F4A1}',
    warning: '\u26A0\uFE0F',
    error: '\u274C',
    success: '\u2705',
  };

  return (
    <div className={`my-6 rounded-r-lg border-l-4 p-4 ${styles[type]}`}>
      <div className="flex items-start">
        <span className="mr-4 flex-shrink-0 text-lg">{icons[type]}</span>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

const mdxComponents = createMDXComponents({ Callout });

// Generate metadata
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getBlogPost(slug, locale);

  if (!post) {
    return generateSEOMetadata({
      title: locale === 'ja' ? '記事が見つかりません' : 'Article Not Found',
      description:
        locale === 'ja'
          ? 'お探しの記事は見つかりませんでした。'
          : 'The article you are looking for could not be found.',
      url: `/${locale}/blog/${slug}`,
      locale: locale,
    });
  }

  const { frontMatter } = post;

  return generateSEOMetadata({
    title: frontMatter.title,
    description: frontMatter.description,
    url: `/${locale}/blog/${slug}`,
    locale: locale,
    type: 'article',
    publishedTime: frontMatter.publishedAt,
    modifiedTime: frontMatter.updatedAt || frontMatter.publishedAt,
    authors: [frontMatter.author],
    tags: frontMatter.tags,
    keywords: frontMatter.tags,
    image: frontMatter.coverImage,
    section: frontMatter.category,
  });
}

// ISR: ブログ記事は1時間ごとに再検証
export const revalidate = 3600;

// Generate static paths
export async function generateStaticParams() {
  const params = [];

  for (const locale of routing.locales) {
    const posts = await getAllBlogPostMetas(locale);
    for (const post of posts) {
      params.push({ locale, slug: post.slug });
    }
  }

  return params;
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('blog');
  const tCommon = await getTranslations('common');

  const post = await getBlogPost(slug, locale);

  if (!post) {
    notFound();
  }

  // Remove duplicate h1 title from MDX content (already shown in page header)
  let processedContent = post.content;

  const titlePattern = new RegExp(
    `^# ${post.frontMatter.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`,
    'gm',
  );
  processedContent = processedContent.replace(titlePattern, '');

  // Remove leading empty lines
  processedContent = processedContent.replace(/^\n+/, '');

  const relatedPosts = await getRelatedPosts(slug, 3, locale);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.frontMatter.title,
    description: post.frontMatter.description,
    author: {
      '@type': 'Person',
      name: post.frontMatter.author,
    },
    datePublished: post.frontMatter.publishedAt,
    dateModified: post.frontMatter.updatedAt || post.frontMatter.publishedAt,
    keywords: post.frontMatter.tags.join(', '),
    articleSection: post.frontMatter.category,
    wordCount: post.readingTime * 200,
    timeRequired: `PT${post.readingTime}M`,
    image: post.frontMatter.coverImage,
    publisher: {
      '@type': 'Organization',
      name: 'Dayopt Platform',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="bg-background min-h-screen">
        <article className="py-8">
          <Container>
            <div className="mx-auto flex max-w-4xl gap-8">
              <div className="min-w-0 flex-1 pt-16">
                <div className="mb-8">
                  <nav
                    aria-label="breadcrumb"
                    className="flex min-w-0 items-center space-x-2 text-sm"
                  >
                    <Link
                      href="/"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tCommon('navigation.home')}
                    </Link>
                    <span className="text-border">/</span>
                    <Link
                      href="/blog"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tCommon('navigation.blog')}
                    </Link>
                    <span className="text-border">/</span>
                    <span className="text-foreground truncate font-medium">
                      {post.frontMatter.title}
                    </span>
                  </nav>
                </div>

                <time
                  className="text-muted-foreground mb-2 block text-sm"
                  dateTime={post.frontMatter.publishedAt}
                >
                  {new Date(post.frontMatter.publishedAt).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>

                <h1 className="text-foreground mb-8 text-4xl font-medium break-words">
                  {post.frontMatter.title}
                </h1>

                {post.frontMatter.coverImage && (
                  <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl shadow-lg">
                    <Image
                      src={post.frontMatter.coverImage}
                      alt={post.frontMatter.title}
                      fill
                      className="rounded-2xl object-cover"
                      priority
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
                    />
                  </div>
                )}

                <div>
                  <MDXRemote
                    source={processedContent}
                    components={mdxComponents}
                    options={{
                      mdxOptions: {
                        remarkPlugins: [remarkGfm],
                        rehypePlugins: [rehypeHighlight],
                      },
                    }}
                  />
                </div>

                <div className="border-border mt-8 border-t pt-6"></div>

                <div className="mt-6 space-y-6">
                  <div>
                    <h3 className="text-foreground mb-4 text-lg font-medium">
                      {t('post.tagsUsed')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {post.frontMatter.tags.map((tag) => (
                        <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
                          <TagPill tag={tag} />
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-4 text-lg font-medium">{t('share.title')}</h3>
                    <ShareButton title={post.frontMatter.title} slug={slug} />
                  </div>
                </div>
              </div>

              <aside className="hidden w-60 flex-shrink-0 xl:block">
                <div className="sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto pt-16 pl-6">
                  <ClientTableOfContents content={post.content} />
                </div>
              </aside>
            </div>
          </Container>
        </article>

        <RelatedPosts posts={relatedPosts} currentSlug={slug} locale={locale} />
      </div>
    </>
  );
}
