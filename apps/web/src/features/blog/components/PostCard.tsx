import { TagPill } from '@/components/ui/display/tag-pill';
import { Link } from '@/platform/i18n/navigation';
import { Heading } from '@dayopt/components';
import { BlogPostMeta } from '../lib/blog';
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
  const formatDate = (dateString: string) => {
    const localeCode = locale === 'ja' ? 'ja-JP' : 'en-US';
    return new Date(dateString).toLocaleDateString(localeCode, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formattedDate = formatDate(post.frontMatter.publishedAt);

  // List layout: cover image + title → tags (#付き) → date
  if (layout === 'list') {
    return (
      <article className="relative py-6 first:pt-0">
        <div className="hover:bg-state-hover -m-4 flex items-center gap-5 rounded-xl p-4 transition-colors">
          {/* カバー画像（控えめサイズ） */}
          <div className="w-56 flex-shrink-0">
            <BlogImage
              src={post.frontMatter.coverImage}
              alt={post.frontMatter.title}
              priority={priority}
              sizes="224px"
            />
          </div>

          {/* コンテンツ: タイトル → タグ → 日付 */}
          <div className="min-w-0 flex-1">
            {/* タイトル（stretched link でカード全体をクリック可能に） */}
            <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
              <Heading as="h2" size="md" className="text-foreground font-medium">
                {post.frontMatter.title}
              </Heading>
            </Link>

            {/* タグ（#付き・全表示・個別クリック可能） */}
            <div className="relative z-10 mt-3 flex flex-wrap items-center gap-1">
              {post.frontMatter.tags.map((tag) => (
                <Link key={tag} href={`/tags/${tag}`}>
                  <TagPill tag={tag} />
                </Link>
              ))}
            </div>

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
    // Vertical layout (for featured articles): image on top, content below
    return (
      <article className="group bg-card overflow-hidden rounded-2xl">
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
          {/* Title */}
          <Link href={`/blog/${post.slug}`}>
            <Heading
              as="h2"
              size="xl"
              className="mb-4 line-clamp-2 cursor-pointer transition-colors hover:underline"
            >
              {post.frontMatter.title}
            </Heading>
          </Link>

          {/* Tags */}
          <div className="mb-4 flex flex-wrap gap-1">
            {post.frontMatter.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>

          {/* Meta information */}
          <div className="text-muted-foreground text-sm">
            <time dateTime={post.frontMatter.publishedAt}>{formattedDate}</time>
          </div>
        </div>
      </article>
    );
  }

  // Horizontal layout (for regular articles): image on left, content on right
  return (
    <article className="group bg-card overflow-hidden rounded-2xl">
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

            {/* Tags */}
            <div className="mb-4 flex flex-wrap gap-1">
              {post.frontMatter.tags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>

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
