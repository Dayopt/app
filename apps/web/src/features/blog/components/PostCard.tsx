'use client';

import { Heading } from '@dayopt/components';
import { Link } from '@dayopt/i18n/navigation';
import { useTranslations } from 'next-intl';
import { BlogPostMeta } from '../lib/blog';
import { isBlogCategoryKey } from '../lib/categories';
import { BlogImage } from './BlogImage';

interface PostCardProps {
  post: BlogPostMeta;
  priority?: boolean;
  layout?: 'horizontal' | 'vertical' | 'list';
  locale?: string;
}

export function PostCard({
  post,
  priority = false,
  layout = 'horizontal',
  locale = 'en',
}: PostCardProps) {
  const t = useTranslations('blog');

  const formatDate = (dateString: string) => {
    const localeCode = locale === 'ja' ? 'ja-JP' : 'en-US';
    return new Date(dateString).toLocaleDateString(localeCode, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formattedDate = formatDate(post.frontMatter.publishedAt);

  // 既知カテゴリは i18n ラベル、未知（再分類前の古い値など）は raw 値を表示
  const categoryKey = post.frontMatter.category.toLowerCase();
  const categoryLabel = isBlogCategoryKey(categoryKey)
    ? t(`tabs.${categoryKey}`)
    : post.frontMatter.category;

  const CategoryLabel = ({ className = '' }: { className?: string }) => (
    <span
      className={`text-muted-foreground text-xs font-medium tracking-wide uppercase ${className}`}
    >
      {categoryLabel}
    </span>
  );

  // List layout: cover image + category → title → date
  if (layout === 'list') {
    return (
      <article className="relative py-6 first:pt-0">
        <div className="hover:bg-state-hover -m-4 flex items-center gap-4 rounded-2xl p-4 transition-colors">
          {/* カバー画像（控えめサイズ） */}
          <div className="w-56 flex-shrink-0">
            <BlogImage
              src={post.frontMatter.coverImage}
              alt={post.frontMatter.title}
              priority={priority}
              sizes="224px"
            />
          </div>

          {/* コンテンツ: カテゴリ → タイトル → 日付 */}
          <div className="min-w-0 flex-1">
            <CategoryLabel className="mb-1 block" />

            {/* タイトル（stretched link でカード全体をクリック可能に） */}
            <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
              <Heading as="h2" size="md" className="text-foreground font-medium">
                {post.frontMatter.title}
              </Heading>
            </Link>

            {/* 日付 */}
            <div className="text-muted-foreground mt-3 text-sm">
              <time dateTime={post.frontMatter.publishedAt}>{formattedDate}</time>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (layout === 'vertical') {
    // Vertical layout: image on top, content below
    return (
      <article className="group bg-card overflow-hidden rounded-2xl shadow-sm">
        {/* Cover image */}
        <Link href={`/blog/${post.slug}`} className="block">
          <BlogImage
            src={post.frontMatter.coverImage}
            alt={post.frontMatter.title}
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </Link>

        {/* Content */}
        <div className="p-6">
          <CategoryLabel className="mb-2 block" />

          {/* Title */}
          <Link href={`/blog/${post.slug}`}>
            <Heading
              as="h2"
              size="lg"
              className="mb-3 line-clamp-2 cursor-pointer transition-colors hover:underline"
            >
              {post.frontMatter.title}
            </Heading>
          </Link>

          {/* Meta information */}
          <div className="text-muted-foreground text-sm">
            <time dateTime={post.frontMatter.publishedAt}>{formattedDate}</time>
          </div>
        </div>
      </article>
    );
  }

  // Horizontal layout: image on left, content on right
  return (
    <article className="group bg-card overflow-hidden rounded-2xl shadow-sm">
      <div className="flex gap-6">
        {/* Left side: Cover image */}
        <Link href={`/blog/${post.slug}`} className="w-80 flex-shrink-0">
          <BlogImage
            src={post.frontMatter.coverImage}
            alt={post.frontMatter.title}
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
          />
        </Link>

        {/* Right side: Content */}
        <div className="flex-1">
          <div className="my-1">
            <CategoryLabel className="mb-2 block" />

            {/* Title */}
            <Link href={`/blog/${post.slug}`}>
              <Heading
                as="h2"
                size="lg"
                className="mb-4 line-clamp-2 cursor-pointer transition-colors hover:underline"
              >
                {post.frontMatter.title}
              </Heading>
            </Link>

            {/* Meta information */}
            <div className="text-muted-foreground text-sm">
              <time dateTime={post.frontMatter.publishedAt}>{formattedDate}</time>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
