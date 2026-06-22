'use client';

import { InlineTagFilter } from '@/components/ui/inline-tag-filter';
import { MobileFilterSheet } from '@/components/ui/mobile-filter-sheet';
import { cn } from '@/lib/utils';
import { Button } from '@dayopt/components';
import { Calendar, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface BlogFiltersProps {
  tags: Array<{ tag: string; count: number }>;
  className?: string;
  onFiltersChange?: (filters: BlogFilterState) => void;
  locale: string;
}

export interface BlogFilterState {
  selectedTags: string[];
  searchQuery: string;
  sortBy: 'date';
  sortOrder: 'asc' | 'desc';
}

const defaultFilters: BlogFilterState = {
  selectedTags: [],
  searchQuery: '',
  sortBy: 'date',
  sortOrder: 'desc',
};

export function BlogFilters({ tags, className, onFiltersChange, locale }: BlogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [filters, setFilters] = useState<BlogFilterState>(defaultFilters);
  const t = useTranslations('blog.filters');

  // URLパラメータから初期状態を復元
  useEffect(() => {
    const tagsParam = searchParams.get('tags');
    const searchParam = searchParams.get('search');
    const sortParam = searchParams.get('sort');
    const orderParam = searchParams.get('order');

    const initialFilters: BlogFilterState = {
      selectedTags: tagsParam ? tagsParam.split(',') : [],
      searchQuery: searchParam || '',
      sortBy: (sortParam as BlogFilterState['sortBy']) || 'date',
      sortOrder: (orderParam as BlogFilterState['sortOrder']) || 'desc',
    };

    setFilters(initialFilters);
  }, [searchParams]);

  // フィルター状態をURLに反映
  const updateURL = useCallback(
    (newFilters: BlogFilterState) => {
      const params = new URLSearchParams();

      if (newFilters.selectedTags.length > 0) {
        params.set('tags', newFilters.selectedTags.join(','));
      }
      if (newFilters.searchQuery) {
        params.set('search', newFilters.searchQuery);
      }
      if (newFilters.sortBy !== 'date') {
        params.set('sort', newFilters.sortBy);
      }
      if (newFilters.sortOrder !== 'desc') {
        params.set('order', newFilters.sortOrder);
      }

      const paramString = params.toString();
      const basePath = locale === 'ja' ? '/ja/blog' : '/blog';
      const newUrl = paramString ? `${basePath}?${paramString}` : basePath;
      router.push(newUrl, { scroll: false });
    },
    [router, locale],
  );

  // フィルター状態の更新
  const updateFilters = useCallback(
    (newFilters: BlogFilterState) => {
      setFilters(newFilters);
      updateURL(newFilters);
      onFiltersChange?.(newFilters);
    },
    [updateURL, onFiltersChange],
  );

  // タグの選択/選択解除
  const toggleTag = (tag: string) => {
    const newSelectedTags = filters.selectedTags.includes(tag)
      ? filters.selectedTags.filter((t) => t !== tag)
      : [...filters.selectedTags, tag];

    updateFilters({ ...filters, selectedTags: newSelectedTags });
  };

  // ソート順の切り替え
  const toggleSortOrder = () => {
    const newOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
    updateFilters({ ...filters, sortOrder: newOrder });
  };

  // フィルターをクリア
  const clearFilters = () => {
    updateFilters(defaultFilters);
  };

  // アクティブなフィルターの数
  const activeFiltersCount = filters.selectedTags.length + (filters.searchQuery ? 1 : 0);

  // フィルターUI（デスクトップ・モバイル共有）
  const filterContent = (
    <>
      {/* ソート */}
      <div>
        <span id="sort-label" className="text-muted-foreground mb-4 block text-sm font-medium">
          {t('sortBy')}
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sort-label">
          <Button
            onClick={toggleSortOrder}
            variant="outline"
            size="sm"
            className="hover:bg-state-hover inline-flex items-center gap-2 bg-transparent transition-colors"
          >
            <Calendar className="size-4" />
            {filters.sortOrder === 'asc' ? t('orderAsc') : t('orderDesc')}
          </Button>
        </div>
      </div>

      {/* タグフィルター */}
      <InlineTagFilter
        tags={tags}
        selectedTags={filters.selectedTags}
        onToggle={toggleTag}
        onClear={() => updateFilters({ ...filters, selectedTags: [] })}
        label={t('filterByTags')}
        showMoreLabel={t('showMore')}
        showLessLabel={t('showLess')}
      />
    </>
  );

  return (
    <>
      {/* デスクトップ版 */}
      <div
        className={cn('border-border bg-background hidden rounded-2xl border lg:block', className)}
      >
        {/* フィルターヘッダー */}
        <div className="border-border border-b p-4">
          <div className="flex items-center gap-2">
            <Filter className="text-muted-foreground size-5" />
            <h3 className="text-foreground font-medium">{t('title')}</h3>
            {activeFiltersCount > 0 && (
              <span className="bg-muted text-primary border-primary rounded-full border px-2 py-1 text-xs font-medium">
                {activeFiltersCount}
              </span>
            )}
          </div>
        </div>

        {/* フィルター内容 */}
        <div className="space-y-6 p-4">{filterContent}</div>
      </div>

      {/* モバイル版フィルター */}
      <MobileFilterSheet
        isOpen={isMobileOpen}
        onOpenChange={setIsMobileOpen}
        activeFilterCount={activeFiltersCount}
        onClear={clearFilters}
        onApply={() => {}}
        title={t('title')}
        clearLabel={t('clearAll')}
        applyLabel={t('applyFilters')}
        triggerLabel={t('title')}
      >
        {filterContent}
      </MobileFilterSheet>
    </>
  );
}
