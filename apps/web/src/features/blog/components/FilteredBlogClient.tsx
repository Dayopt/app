'use client';

import { EmptyState } from '@/components/ui/feedback/empty-state';
import { SearchInput } from '@/components/ui/inputs/search-input';
import { ContentPagination } from '@/components/ui/navigation/content-pagination';
import { Tabs, TabsList, TabsTrigger } from '@dayopt/components';
import { Rss, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { BlogPostMeta } from '../lib/blog';
import { PostCard } from './PostCard';

const POSTS_PER_PAGE = 12;

// タブ = blog の category。'all' は全件表示の特別値。
const BLOG_CATEGORIES = ['all', 'guide', 'philosophy', 'release', 'devlog'] as const;
type BlogCategory = (typeof BLOG_CATEGORIES)[number];

interface FilteredBlogClientProps {
  initialPosts: BlogPostMeta[];
  locale: string;
}

export function FilteredBlogClient({ initialPosts, locale }: FilteredBlogClientProps) {
  const t = useTranslations('blog');
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<BlogCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const currentPage = Number(searchParams?.get('page')) || 1;

  // カテゴリ（タブ）+ 検索で絞り込み、日付降順
  const filteredPosts = useMemo(() => {
    let filtered = [...initialPosts];

    if (activeCategory !== 'all') {
      filtered = filtered.filter(
        (post) => post.frontMatter.category.toLowerCase() === activeCategory,
      );
    }

    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      filtered = filtered.filter((post) => {
        const { title, description, category } = post.frontMatter;
        return (
          title.toLowerCase().includes(term) ||
          description?.toLowerCase().includes(term) ||
          category.toLowerCase().includes(term) ||
          post.excerpt.toLowerCase().includes(term)
        );
      });
    }

    filtered.sort(
      (a, b) =>
        new Date(b.frontMatter.publishedAt).getTime() -
        new Date(a.frontMatter.publishedAt).getTime(),
    );

    return filtered;
  }, [initialPosts, activeCategory, searchQuery]);

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const currentPosts = filteredPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);

  const resetFilters = () => {
    setActiveCategory('all');
    setSearchQuery('');
  };

  return (
    <div>
      {/* タイトルは header ナビの「ブログ」ハイライトで示すため非表示（a11y/SEO 用に sr-only で残す） */}
      <h1 className="sr-only">{t('header.title')}</h1>

      {/* タブ（カテゴリ）+ RSS + 検索 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeCategory}
          onValueChange={(value) => setActiveCategory(value as BlogCategory)}
        >
          <TabsList className="flex-wrap">
            {BLOG_CATEGORIES.map((category) => (
              <TabsTrigger key={category} value={category}>
                {t(`tabs.${category}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* RSS は検索の左に配置（位置は要検討の暫定） */}
          <a
            href="/blog/feed.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            aria-label="RSS Feed"
          >
            <Rss className="size-5" />
          </a>
          <div className="sm:w-72">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('filters.searchPlaceholder')}
              clearLabel={t('filters.clearSearch')}
            />
          </div>
        </div>
      </div>

      {/* カードグリッド */}
      <div className="mt-8">
        {currentPosts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {currentPosts.map((post, index) => (
                <PostCard
                  key={post.slug}
                  post={post}
                  priority={currentPage === 1 && index < 3}
                  layout="vertical"
                  locale={locale}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-12">
                <ContentPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  basePath={locale === 'ja' ? '/ja/blog' : '/blog'}
                />
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Search}
            title={t('list.noArticles')}
            description={t('list.noArticlesHint')}
            action={{
              label: t('list.clearAllFilters'),
              onClick: resetFilters,
            }}
          />
        )}
      </div>
    </div>
  );
}
