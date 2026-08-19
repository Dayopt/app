'use client';

import { CalendarX2, Clock3, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';

import { resolveTagColor, TagIcon } from '@/features/tags';
import { formatDurationMinutes } from '@/lib/date';
import { cn } from '@dayopt/components';

import type { BarComparisonRow } from '../../domain/timePL/types';
import { TimePLTagMarker } from '../time-pl/TimePLTagMarker';
import { formatVariance, getVarianceColor } from '../time-pl/data/timePL.presentation';

export interface WeeklyReflectionEstimationRow {
  tagId: string | null;
  tagName: string | null;
  tagColor: string | null;
  isUncategorized: boolean;
  avgPlannedMinutes: number;
  avgActualMinutes: number;
  avgDeviationMinutes: number;
  recordCount: number;
}

interface WeeklyReflectionSkipSummary {
  skippedCount: number;
  skippedMinutes: number;
  topTagName?: string | null | undefined;
}

interface WeeklyReflectionBlankSummary {
  availableMinutes: number;
  scheduledMinutes: number;
  blankRate: number;
}

interface WeeklyReflectionPanelProps {
  trackedMinutes: number;
  planAccuracyRate: number | null;
  confirmedRate?: number | null | undefined;
  plannedMinutes: number;
  diffMinutes: number;
  timePLRows: readonly BarComparisonRow[];
  estimationRows?: readonly WeeklyReflectionEstimationRow[] | undefined;
  skipSummary?: WeeklyReflectionSkipSummary | null | undefined;
  blankSummary?: WeeklyReflectionBlankSummary | null | undefined;
  onTagClick?: ((tagId: string) => void) | undefined;
}

export function WeeklyReflectionPanel({
  trackedMinutes,
  planAccuracyRate,
  confirmedRate,
  plannedMinutes,
  diffMinutes,
  timePLRows,
  estimationRows,
  skipSummary,
  blankSummary,
  onTagClick,
}: WeeklyReflectionPanelProps) {
  const t = useTranslations('calendar.stats');
  const sortedEstimationRows = useMemo(
    () =>
      [...(estimationRows ?? [])]
        .filter((row) => row.recordCount > 0)
        .sort((a, b) => Math.abs(b.avgDeviationMinutes) - Math.abs(a.avgDeviationMinutes)),
    [estimationRows],
  );
  const signal = deriveReflectionSignal({
    t,
    estimationRows: sortedEstimationRows,
    skipSummary,
    blankSummary,
  });
  const hasSkipSummary = skipSummary != null;
  const hasBlankSummary = blankSummary != null;

  return (
    <div className="flex flex-col gap-4">
      <section className="border-border-subtle rounded-lg border p-4">
        <p className="text-foreground text-sm">{signal.text}</p>
        {signal.detail && <p className="text-muted-foreground mt-1 text-sm">{signal.detail}</p>}
      </section>

      <dl className="border-border-subtle divide-border-subtle divide-y rounded-lg border">
        <ReviewMetricRow
          label={t('overview.trackedTime')}
          value={formatDurationMinutes(trackedMinutes)}
        />
        <ReviewMetricRow
          label={t('overview.planAccuracy')}
          value={planAccuracyRate === null ? t('metrics.noData') : formatPercent(planAccuracyRate)}
        />
        <ReviewMetricRow
          label={confirmedRate == null ? t('overview.diff') : t('review.confirmedRate')}
          value={confirmedRate == null ? formatVariance(diffMinutes) : formatPercent(confirmedRate)}
          valueClassName={
            confirmedRate == null
              ? getVarianceColor(plannedMinutes > 0 ? (diffMinutes / plannedMinutes) * 100 : 0)
              : undefined
          }
        />
      </dl>

      <ReflectionSection title={t('review.timePLTitle')}>
        {timePLRows.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="flex flex-col gap-1">
            {timePLRows.map((row) => (
              <TimePLRow key={row.activityId ?? 'no-activity'} row={row} onTagClick={onTagClick} />
            ))}
          </div>
        )}
      </ReflectionSection>

      <ReflectionSection title={t('review.estimationBiasTitle')}>
        {sortedEstimationRows.length === 0 ? (
          <EmptySection />
        ) : (
          <div className="divide-border-subtle divide-y">
            {sortedEstimationRows.map((row) => (
              <EstimationBiasRow key={row.tagId ?? 'uncategorized'} row={row} />
            ))}
          </div>
        )}
      </ReflectionSection>

      {(hasSkipSummary || hasBlankSummary) && (
        <div
          className={cn(
            'grid gap-2',
            hasSkipSummary && hasBlankSummary ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {skipSummary && (
            <CompactSignal
              icon={CalendarX2}
              label={t('review.skipTitle')}
              value={t('review.skipValue', { count: skipSummary.skippedCount })}
              detail={formatDurationMinutes(skipSummary.skippedMinutes)}
            />
          )}
          {blankSummary && (
            <CompactSignal
              icon={Clock3}
              label={t('review.blankTitle')}
              value={formatPercent(blankSummary.blankRate)}
              detail={t('review.blankDetail', {
                time: formatDurationMinutes(
                  blankSummary.availableMinutes - blankSummary.scheduledMinutes,
                ),
              })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReflectionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border-subtle rounded-lg border">
      <div className="border-border-subtle border-b px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

export function ReviewMetricRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string | undefined;
}) {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 px-3 py-2">
      <dt className="text-muted-foreground min-w-0 flex-1 text-xs">{label}</dt>
      <dd className={cn('shrink-0 text-sm font-medium tabular-nums', valueClassName)}>{value}</dd>
    </div>
  );
}

function TimePLRow({
  row,
  onTagClick,
}: {
  row: BarComparisonRow;
  onTagClick?: ((activityId: string) => void) | undefined;
}) {
  const t = useTranslations('calendar.stats.overview');
  const activityName = row.isNoActivity ? t('uncategorized') : row.activityName;
  const content = (
    <>
      <TimePLTagMarker
        isNoActivity={row.isNoActivity}
        categoryIcon={row.categoryIcon}
        categoryColor={row.categoryColor}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{activityName}</span>
        <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
          {formatDurationMinutes(row.budgetMinutes)} / {formatDurationMinutes(row.actualMinutes)}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 text-xs font-medium tabular-nums',
          getVarianceColor(row.variancePercent),
        )}
      >
        {formatVariance(row.varianceMinutes)}
      </span>
    </>
  );

  if (row.isNoActivity || row.activityId == null || !onTagClick) {
    return <div className="flex min-h-11 items-center gap-2 px-2 py-2">{content}</div>;
  }

  const activityId = row.activityId;

  return (
    <button
      type="button"
      className="hover:bg-state-hover flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150"
      onClick={() => onTagClick(activityId)}
    >
      {content}
    </button>
  );
}

function EstimationBiasRow({ row }: { row: WeeklyReflectionEstimationRow }) {
  const t = useTranslations('calendar.stats.overview');
  const deviation = Math.round(row.avgDeviationMinutes);
  const tagName = row.isUncategorized ? t('uncategorized') : row.tagName;

  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 px-2 py-2">
      <TagIcon
        icon={null}
        color={resolveTagColor(row.tagColor)}
        size="sm"
        isUncategorized={row.isUncategorized}
      />
      <span className="text-foreground min-w-0 flex-1 truncate text-sm">{tagName}</span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {formatDurationMinutes(Math.round(row.avgPlannedMinutes))} /{' '}
        {formatDurationMinutes(Math.round(row.avgActualMinutes))}
      </span>
      <span
        className={cn(
          'w-14 shrink-0 text-right text-xs font-medium tabular-nums',
          deviation > 0 ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {formatVariance(deviation)}
      </span>
    </div>
  );
}

function CompactSignal({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="border-border-subtle min-w-0 rounded-lg border p-3">
      <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-foreground mt-2 truncate text-sm font-medium tabular-nums">{value}</div>
      <p className="text-muted-foreground mt-1 truncate text-xs">{detail}</p>
    </section>
  );
}

function EmptySection() {
  const t = useTranslations('calendar.stats');
  return (
    <p className="text-muted-foreground px-2 py-4 text-center text-sm">{t('metrics.noData')}</p>
  );
}

function deriveReflectionSignal({
  t,
  estimationRows,
  skipSummary,
  blankSummary,
}: {
  t: ReturnType<typeof useTranslations<'calendar.stats'>>;
  estimationRows: readonly WeeklyReflectionEstimationRow[];
  skipSummary?: WeeklyReflectionSkipSummary | null | undefined;
  blankSummary?: WeeklyReflectionBlankSummary | null | undefined;
}): { text: string; detail?: string | undefined } {
  const topBias = estimationRows[0];
  if (topBias && Math.abs(topBias.avgDeviationMinutes) >= 15) {
    const bias = Math.abs(Math.round(topBias.avgDeviationMinutes));
    // 未分類が最大バイアスの場合、tagName(null) をそのまま補間せず翻訳ラベルへ差し替える
    const tagLabel = topBias.tagName ?? t('overview.uncategorized');
    return {
      text:
        topBias.avgDeviationMinutes > 0
          ? t('review.insightEstimationOver', { tag: tagLabel, bias })
          : t('review.insightEstimationUnder', { tag: tagLabel, bias }),
      detail: t('review.insightEstimationDetail'),
    };
  }

  if (skipSummary && skipSummary.skippedCount > 0) {
    return {
      text: t('review.insightSkip', { count: skipSummary.skippedCount }),
      detail: skipSummary.topTagName
        ? t('review.insightSkipDetail', { tag: skipSummary.topTagName })
        : undefined,
    };
  }

  if (blankSummary && blankSummary.blankRate >= 0.35) {
    return {
      text: t('review.insightBlank', { rate: Math.round(blankSummary.blankRate * 100) }),
      detail: t('review.insightBlankDetail'),
    };
  }

  return {
    text: t('review.insightStable'),
    detail: t('review.insightStableDetail'),
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
