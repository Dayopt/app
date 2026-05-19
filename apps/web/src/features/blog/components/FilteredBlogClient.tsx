'use client';

import { ContentHeader } from '@/components/content/ContentHeader';
import { ContentPagination } from '@/components/ui/content-pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Rss, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { BlogPostMeta } from '../lib/blog';
import { BlogFilters, type BlogFilterState } from './BlogFilters';
import { BlogSkeleton } from './BlogSkeleton';
import { PostCard } from './PostCard';

const POSTS_PER_PAGE = 12;

interface FilteredBlogClientProps {
  initialPosts: BlogPostMeta[];
  tags: string[];
  locale: string;
}

export function FilteredBlogClient({ initialPosts, tags, locale }: FilteredBlogClientProps) {
  const t = useTranslations('blog');
  const searchParams = useSearchParams();
  const [filteredAndSortedPosts, setFilteredAndSortedPosts] =
    useState<BlogPostMeta[]>(initialPosts);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filters, setFilters] = useState<BlogFilterState>({
    selectedTags: [],
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',
  });

  // タグごとの記事数を計算
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    initialPosts.forEach((post) => {
      post.frontMatter.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return tags.map((tag) => ({ tag, count: counts.get(tag) || 0 }));
  }, [initialPosts, tags]);

  const currentPage = Number(searchParams?.get('page')) || 1;

  // URLパラメータから初期状態を復元
  useEffect(() => {
    const tagsParam = searchParams?.get('tags');
    const searchParam = searchParams?.get('search');
    const sortParam = searchParams?.get('sort');
    const orderParam = searchParams?.get('order');

    const initialFilters: BlogFilterState = {
      selectedTags: tagsParam ? tagsParam.split(',') : [],
      searchQuery: searchParam || '',
      sortBy: (sortParam as BlogFilterState['sortBy']) || 'date',
      sortOrder: (orderParam as BlogFilterState['sortOrder']) || 'desc',
    };

    setFilters(initialFilters);
  }, [searchParams]);

  // フィルタリングとソート処理
  useEffect(() => {
    const processPosts = () => {
      setIsProcessing(true);
      try {
        let filtered = [...initialPosts];

        // 検索クエリによるフィルタリング
        if (filters.searchQuery) {
          const searchTerm = filters.searchQuery.toLowerCase();
          filtered = filtered.filter((post) => {
            const titleMatch = post.frontMatter.title.toLowerCase().includes(searchTerm);
            const descriptionMatch = post.frontMatter.description
              ?.toLowerCase()
              .includes(searchTerm);
            const tagMatch = post.frontMatter.tags.some((tag) =>
              tag.toLowerCase().includes(searchTerm),
            );
            const categoryMatch = post.frontMatter.category.toLowerCase().includes(searchTerm);
            const excerptMatch = post.excerpt.toLowerCase().includes(searchTerm);

            return titleMatch || descriptionMatch || tagMatch || categoryMatch || excerptMatch;
          });
        }

        // タグによるフィルタリング（OR 固定）
        if (filters.selectedTags.length > 0) {
          filtered = filtered.filter((post) =>
            filters.selectedTags.some((tag) => post.frontMatter.tags?.includes(tag)),
          );
        }

        // ソート処理（日付順）
        filtered.sort((a, b) => {
          const comparison =
            new Date(a.frontMatter.publishedAt).getTime() -
            new Date(b.frontMatter.publishedAt).getTime();
          return filters.sortOrder === 'asc' ? comparison : -comparison;
        });

        setFilteredAndSortedPosts(filtered);
      } catch {
        // 処理失敗時は空配列のまま
      } finally {
        setIsProcessing(false);
      }
    };

    processPosts();
  }, [initialPosts, filters]);

  // ページネーション
  const totalPosts = filteredAndSortedPosts.length;
  const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const currentPosts = filteredAndSortedPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);

  const handleFiltersChange = (newFilters: BlogFilterState) => {
    setFilters(newFilters);
  };

  const handleSearchChange = (query: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: query }));
  };

  const clearAllFilters = () => {
    setFilters({
      selectedTags: [],
      searchQuery: '',
      sortBy: 'date',
      sortOrder: 'desc',
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <ContentHeader title={t('header.title')} />
        <a
          href="/blog/feed.xml"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="RSS Feed"
        >
          <Rss className="size-5" />
        </a>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
        {/* 左サイドバー: フィルター */}
        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <BlogFilters tags={tagCounts} onFiltersChange={handleFiltersChange} locale={locale} />
          </div>
        </div>

        {/* 右側: 記事一覧 */}
        <div className="lg:col-span-3">
          {/* 検索ボックス */}
          <div className="mb-8">
            <SearchInput
              value={filters.searchQuery}
              onChange={handleSearchChange}
              placeholder={t('filters.searchPlaceholder')}
              clearLabel={t('filters.clearSearch')}
            />
          </div>

          {isProcessing ? (
            <BlogSkeleton />
          ) : currentPosts.length > 0 ? (
            <>
              <div className="divide-border divide-y">
                {currentPosts.map((post, index) => (
                  <PostCard
                    key={post.slug}
                    post={post}
                    priority={currentPage === 1 && index < 3}
                    layout="list"
                    locale={locale}
                  />
                ))}
              </div>

              {/* ページネーション */}
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
                onClick: clearAllFilters,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
