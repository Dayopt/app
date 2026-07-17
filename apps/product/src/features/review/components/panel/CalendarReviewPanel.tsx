'use client';

import { BarChart3, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { TagIcon, useTags } from '@/features/tags';
import { formatDurationMinutes } from '@/lib/date';
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@dayopt/components';

import { deriveAccuracy, deriveBarComparison, deriveStatement } from '../../domain/timePL/derivers';
import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useTimePLData } from '../../hooks/useTimePLData';
import type { ReviewDisplayRange } from '../../lib/compute-date-range';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import { ReviewMetricRow, WeeklyReflectionPanel } from '../reflection/WeeklyReflectionPanel';
import { formatVariance, getVarianceColor } from '../time-pl/data/timePL.presentation';

const ALL_SCOPE_VALUE = '__all__';

interface CalendarReviewPanelProps {
  currentDate: Date;
  displayRange: ReviewDisplayRange;
  selectedTagId: string | null;
  onSelectedTagIdChange: (tagId: string | null) => void;
  onClose: () => void;
  variant?: 'rail' | 'sheet' | undefined;
  className?: string | undefined;
}

export function CalendarReviewPanel({
  currentDate,
  displayRange,
  selectedTagId,
  onSelectedTagIdChange,
  onClose,
  variant = 'rail',
  className,
}: CalendarReviewPanelProps) {
  const t = useTranslations('calendar.stats');
  const tAll = useTranslations();
  const setCurrentDate = useReviewFilterStore((s) => s.setCurrentDate);
  const { data: tags } = useTags();

  useEffect(() => {
    setCurrentDate(currentDate);
  }, [currentDate, setCurrentDate]);

  const { data: pageData, isPending, isError } = useReviewPageData(displayRange, currentDate);
  const {
    data: timePLData,
    isPending: isTimePLPending,
    isError: isTimePLError,
  } = useTimePLData(displayRange);

  const statement = useMemo(() => (timePLData ? deriveStatement(timePLData) : null), [timePLData]);
  const accuracy = useMemo(() => (timePLData ? deriveAccuracy(timePLData) : null), [timePLData]);
  const barRows = useMemo(() => (timePLData ? deriveBarComparison(timePLData) : []), [timePLData]);
  const selectedRow = useMemo(
    () => barRows.find((row) => row.tagId === selectedTagId) ?? null,
    [barRows, selectedTagId],
  );

  const isLoading = isPending || isTimePLPending;
  const hasError = isError || isTimePLError;
  const trackedMinutes = pageData?.overview.totalMinutes ?? statement?.actualTotal ?? 0;
  const activeTags = tags?.filter((tag) => tag.is_active !== false) ?? [];
  const selectedTag = selectedTagId
    ? (activeTags.find((tag) => tag.id === selectedTagId) ?? null)
    : null;
  const selectedTagName = selectedRow?.tagName ?? selectedTag?.name ?? t('tag');
  const selectedTagIcon = selectedRow?.tagIcon ?? selectedTag?.icon ?? null;
  const selectedTagColor = selectedRow?.tagColor ?? selectedTag?.color ?? null;
  const isSheet = variant === 'sheet';

  return (
    <section
      className={cn('flex w-full flex-col', !isSheet && 'min-h-0', className)}
      aria-label={tAll('calendar.views.stats')}
    >
      <header className="shrink-0">
        <div className="flex h-12 items-center gap-2 px-4">
          <Select
            value={selectedTagId ?? ALL_SCOPE_VALUE}
            onValueChange={(value) => {
              onSelectedTagIdChange(value === ALL_SCOPE_VALUE ? null : value);
            }}
          >
            <SelectTrigger
              variant="ghost"
              size="sm"
              className="-ml-2 max-w-full min-w-0 flex-1 justify-start px-2 text-sm font-medium"
              aria-label={t('review.scopeLabel')}
            >
              <SelectValue placeholder={t('review.allLabel')} />
            </SelectTrigger>
            <SelectContent align="start" className="w-64">
              <SelectItem value={ALL_SCOPE_VALUE}>{t('review.allLabel')}</SelectItem>
              {activeTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <TagIcon icon={tag.icon} color={tag.color} size="sm" />
                  <span className="truncate">{tag.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon
            className="text-muted-foreground hover:text-foreground -mr-2"
            onClick={onClose}
            aria-label={tAll('actions.close')}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div
        className={cn(
          'scrollbar-stable overflow-y-auto',
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- sheet 高は viewport 連動の min()/dvh が必要でトークン化不可
          isSheet ? 'max-h-[min(72dvh,560px)]' : 'min-h-0 flex-1',
        )}
      >
        <div className={cn('flex flex-col gap-4 p-4', isSheet && 'pt-2')}>
          {hasError ? (
            <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
          ) : isLoading ? (
            <ReviewPanelSkeleton />
          ) : !timePLData && !pageData ? (
            <EmptyState
              icon={BarChart3}
              title={t('review.emptyTitle')}
              description={t('review.emptyDescription')}
              size="sm"
              centered
            />
          ) : selectedTagId ? (
            <div className="border-border-subtle rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <TagIcon icon={selectedTagIcon} color={selectedTagColor} size="sm" />
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{selectedTagName}</h3>
              </div>
              {selectedRow ? (
                <dl className="border-border-subtle divide-border-subtle mt-4 divide-y rounded-lg border">
                  <ReviewMetricRow
                    label={t('overview.planned')}
                    value={formatDurationMinutes(selectedRow.budgetMinutes)}
                  />
                  <ReviewMetricRow
                    label={t('overview.actual')}
                    value={formatDurationMinutes(selectedRow.actualMinutes)}
                  />
                  <ReviewMetricRow
                    label={t('overview.diff')}
                    value={formatVariance(selectedRow.varianceMinutes)}
                    valueClassName={getVarianceColor(selectedRow.variancePercent)}
                  />
                </dl>
              ) : (
                <p className="text-muted-foreground mt-4 text-sm">{t('metrics.noData')}</p>
              )}
            </div>
          ) : (
            <WeeklyReflectionPanel
              trackedMinutes={trackedMinutes}
              planAccuracyRate={accuracy?.rate ?? null}
              plannedMinutes={statement?.budgetTotal ?? 0}
              diffMinutes={statement?.netVarianceMinutes ?? 0}
              timePLRows={barRows}
              estimationRows={pageData?.estimationAccuracy}
              blankSummary={pageData?.blankRate ?? null}
              onTagClick={onSelectedTagIdChange}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
      <Skeleton className="h-32 rounded-lg" />
    </div>
  );
}
