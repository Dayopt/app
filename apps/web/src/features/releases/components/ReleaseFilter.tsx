'use client';

import { InlineTagFilter } from '@/components/ui/inputs/inline-tag-filter';
import { MobileFilterSheet } from '@/components/ui/overlays/mobile-filter-sheet';
import { cn } from '@/lib/utils';
import { Button } from '@dayopt/components';
import { Calendar, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TagCount } from '../lib/releases';

interface ReleaseFilterProps {
  tags: TagCount[];
  selectedTags: string[];
  sortOrder: 'asc' | 'desc';
  onTagToggle: (tag: string) => void;
  onClearFilters: () => void;
  onToggleSortOrder: () => void;
  className?: string;
}

export function ReleaseFilter({
  tags,
  selectedTags,
  sortOrder,
  onTagToggle,
  onClearFilters,
  onToggleSortOrder,
  className,
}: ReleaseFilterProps) {
  const t = useTranslations('releases.filters');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const activeFiltersCount = selectedTags.length;

  const filterContent = (
    <>
      {/* ソート */}
      <div>
        <span id="sort-label" className="text-muted-foreground mb-4 block text-sm font-medium">
          {t('sortBy')}
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sort-label">
          <Button
            onClick={onToggleSortOrder}
            variant="outline"
            size="sm"
            className="hover:bg-state-hover inline-flex items-center gap-2 bg-transparent transition-colors"
          >
            <Calendar className="size-4" />
            {sortOrder === 'asc' ? t('orderAsc') : t('orderDesc')}
          </Button>
        </div>
      </div>

      {/* タグフィルター */}
      <InlineTagFilter
        tags={tags}
        selectedTags={selectedTags}
        onToggle={onTagToggle}
        onClear={onClearFilters}
        label={t('tags')}
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
        onClear={onClearFilters}
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
