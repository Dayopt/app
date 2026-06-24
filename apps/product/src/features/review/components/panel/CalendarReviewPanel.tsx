'use client';

import { BarChart3, CalendarClock, Clock3, Gauge, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';
import { Button, Skeleton } from '@dayopt/components';

import { deriveAccuracy, deriveBarComparison, deriveStatement } from '../../domain/timePL/derivers';
import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useTimePLData } from '../../hooks/useTimePLData';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import {
  formatMinutesDuration,
  formatVariance,
  getVarianceColor,
} from '../time-pl/data/timePL.presentation';

interface CalendarReviewPanelProps {
  currentDate: Date;
  selectedTagId: string | null;
  onSelectedTagIdChange: (tagId: string | null) => void;
  onClose: () => void;
  className?: string | undefined;
}

export function CalendarReviewPanel({
  currentDate,
  selectedTagId,
  onSelectedTagIdChange,
  onClose,
  className,
}: CalendarReviewPanelProps) {
  const t = useTranslations('calendar.stats');
  const tAll = useTranslations();
  const setGranularity = useReviewFilterStore((s) => s.setGranularity);
  const setCurrentDate = useReviewFilterStore((s) => s.setCurrentDate);

  useEffect(() => {
    setGranularity('week');
    setCurrentDate(currentDate);
  }, [currentDate, setCurrentDate, setGranularity]);

  const { data: pageData, isPending, isError } = useReviewPageData();
  const { data: timePLData, isPending: isTimePLPending, isError: isTimePLError } = useTimePLData();

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

  return (
    <section
      className={cn('flex min-h-0 w-full flex-col', className)}
      aria-label={tAll('calendar.views.stats')}
    >
      <header className="border-border-subtle shrink-0 border-b">
        <div className="flex h-12 items-center gap-2 px-4">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
            {tAll('calendar.views.stats')}
          </h2>
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

      <div className="scrollbar-stable min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
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
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <PanelMetric
                  icon={Clock3}
                  label={t('overview.trackedTime')}
                  value={formatMinutesDuration(trackedMinutes)}
                />
                <PanelMetric
                  icon={Gauge}
                  label={t('overview.planAccuracy')}
                  value={accuracy ? `${Math.round(accuracy.rate * 100)}%` : t('metrics.noData')}
                />
                <PanelMetric
                  icon={CalendarClock}
                  label={t('overview.planned')}
                  value={formatMinutesDuration(statement?.budgetTotal ?? 0)}
                />
                <PanelMetric
                  icon={BarChart3}
                  label={t('overview.diff')}
                  value={formatVariance(statement?.netVarianceMinutes ?? 0)}
                  valueClassName={getVarianceColor(
                    statement && statement.budgetTotal > 0
                      ? (statement.netVarianceMinutes / statement.budgetTotal) * 100
                      : 0,
                  )}
                />
              </div>

              <div className="border-border-subtle rounded-lg border">
                <div className="border-border-subtle flex items-center justify-between border-b px-3 py-2">
                  <h3 className="text-sm font-medium">{t('overview.planActual')}</h3>
                  {selectedTagId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectedTagIdChange(null)}
                    >
                      {tAll('actions.clear')}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 p-2">
                  {barRows.length === 0 ? (
                    <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                      {t('metrics.noData')}
                    </p>
                  ) : (
                    barRows.slice(0, 8).map((row) => (
                      <button
                        key={row.tagId}
                        type="button"
                        className={cn(
                          'hover:bg-state-hover flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150',
                          selectedTagId === row.tagId && 'bg-state-selected',
                        )}
                        onClick={() => onSelectedTagIdChange(row.tagId)}
                      >
                        <TagIcon icon={row.tagIcon ?? null} color={row.tagColor} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{row.tagName}</span>
                          <span className="text-muted-foreground mt-1 block font-mono text-xs tabular-nums">
                            {formatMinutesDuration(row.budgetMinutes)} /{' '}
                            {formatMinutesDuration(row.actualMinutes)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 font-mono text-xs font-medium tabular-nums',
                            getVarianceColor(row.variancePercent),
                          )}
                        >
                          {formatVariance(row.varianceMinutes)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedRow ? (
                <div className="border-border-subtle rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <TagIcon
                      icon={selectedRow.tagIcon ?? null}
                      color={selectedRow.tagColor}
                      size="sm"
                    />
                    <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                      {selectedRow.tagName}
                    </h3>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3">
                    <MiniStat
                      label={t('overview.planned')}
                      value={formatMinutesDuration(selectedRow.budgetMinutes)}
                    />
                    <MiniStat
                      label={t('overview.actual')}
                      value={formatMinutesDuration(selectedRow.actualMinutes)}
                    />
                    <MiniStat
                      label={t('overview.diff')}
                      value={formatVariance(selectedRow.varianceMinutes)}
                      valueClassName={getVarianceColor(selectedRow.variancePercent)}
                    />
                  </dl>
                </div>
              ) : null}
            </>
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

function PanelMetric({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClassName?: string | undefined;
}) {
  return (
    <div className="border-border-subtle rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('mt-2 font-mono text-lg font-medium tabular-nums', valueClassName)}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string | undefined;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('mt-1 font-mono text-sm font-medium tabular-nums', valueClassName)}>
        {value}
      </dd>
    </div>
  );
}
