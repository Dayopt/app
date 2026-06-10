'use client';

import { CalendarClock, Clock3, Gauge, Smile } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { useEntries } from '@/features/entry';
import { resolveTagColor, useTagsMap } from '@/features/tags';
import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { addDays } from '@/lib/date/core';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { cn } from '@/lib/utils';

import { computeDailySummary } from '../../domain/dailySummary';
import { computePreviousDateRange, computeStatsDateRange } from '../../lib/compute-date-range';
import { getMetricTrend } from '../../lib/metrics';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import type { ReviewViewProps } from '../../types/review.types';
import { DayTimelineComparison, type TimelineBlock } from '../day/DayTimelineComparison';
import { InsightSlot } from '../shared/InsightSlot';
import { NextActionLink } from '../shared/NextActionLink';
import { OverviewPanel } from '../shared/OverviewPanel';
import { SummaryCard } from '../shared/SummaryCard';
import { formatMinutesDuration } from '../time-pl/data/timePL.presentation';

/** 所見を出す見積もりずれの下限（分） */
const ESTIMATION_BIAS_THRESHOLD = 10;
const DAY_MINUTES = 24 * 60;

/**
 * DailyReview - 日次振り返りビュー（Daily Close）
 *
 * 「今日は計画どおりだったか」に 1〜2 分で答える 1 日の締め。
 * 計画 vs 実績の 2 列タイムラインを主役に、所見 → KPI → タイムライン → 還流導線
 * の順で構成する（review-granularity-redesign 設計書 §5.1）。
 * データは entries（Free）のみで成立し、Pro 集計クエリに依存しない。
 */
export function DailyReview({ className }: ReviewViewProps) {
  const t = useTranslations('calendar.stats');
  const locale = useLocale();
  const router = useRouter();
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const timezone = useUserPreferenceStore((s) => s.timezone);
  const weekStartsOn = useUserPreferenceStore((s) => s.weekStartsOn);
  const { tagsMap } = useTagsMap();

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, 'day', timezone, weekStartsOn),
    [currentDate, timezone, weekStartsOn],
  );
  const prevDateRange = useMemo(
    () => computePreviousDateRange(currentDate, 'day', timezone, weekStartsOn),
    [currentDate, timezone, weekStartsOn],
  );

  const entriesQuery = useEntries({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    sortBy: 'start_time',
    sortOrder: 'asc',
    limit: 100,
  });
  const prevEntriesQuery = useEntries({
    startDate: prevDateRange.startDate,
    endDate: prevDateRange.endDate,
    limit: 100,
  });

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const summary = useMemo(() => computeDailySummary(entries), [entries]);
  const prevSummary = useMemo(
    () => computeDailySummary(prevEntriesQuery.data ?? []),
    [prevEntriesQuery.data],
  );

  // ── KPI トレンド（前日比。前日にデータが無ければ沈黙）──
  const trackedTrend =
    prevSummary.actualMinutes > 0
      ? getMetricTrend(summary.actualMinutes, prevSummary.actualMinutes, 'up')
      : null;
  const accuracyTrend =
    summary.plannedMinutes > 0 && prevSummary.plannedMinutes > 0
      ? getMetricTrend(summary.planAccuracy, prevSummary.planAccuracy, 'up')
      : null;
  const fulfillmentTrend =
    summary.avgFulfillment != null && prevSummary.avgFulfillment != null
      ? getMetricTrend(summary.avgFulfillment, prevSummary.avgFulfillment, 'up')
      : null;

  // ── 研究者の所見（見積もりずれが閾値を超えた日だけ）──
  const insightText = useMemo(() => {
    const bias = summary.estimationBiasMinutes;
    if (bias == null || Math.abs(bias) < ESTIMATION_BIAS_THRESHOLD) return null;
    const params = { bias: Math.abs(Math.round(bias)) };
    return bias > 0
      ? t('insights.dayEstimationOver', params)
      : t('insights.dayEstimationUnder', params);
  }, [summary.estimationBiasMinutes, t]);

  // ── タイムラインのブロック化（日の開始からの分オフセットに変換）──
  const dayStartMs = useMemo(() => new Date(dateRange.startDate).getTime(), [dateRange.startDate]);

  const toBlocks = useMemo(() => {
    const clampMin = (iso: string) =>
      Math.min(DAY_MINUTES, Math.max(0, (new Date(iso).getTime() - dayStartMs) / 60_000));

    const build = (
      getStart: (e: (typeof entries)[number]) => string | null,
      getEnd: (e: (typeof entries)[number]) => string | null,
    ): TimelineBlock[] =>
      entries
        .filter((e) => getStart(e) && getEnd(e))
        .map((e) => ({
          id: e.id,
          title: e.title,
          startMin: clampMin(getStart(e)!),
          endMin: clampMin(getEnd(e)!),
          color: resolveTagColor(e.tagId ? tagsMap.get(e.tagId)?.color : null),
        }))
        .filter((b) => b.endMin > b.startMin);

    return {
      planned: build(
        (e) => e.start_time,
        (e) => e.end_time,
      ),
      actual: build(
        (e) => e.actual_start_time,
        (e) => e.actual_end_time,
      ),
    };
  }, [entries, dayStartMs, tagsMap]);

  const formatTime = useMemo(
    () => (minutesFromDayStart: number) =>
      formatInTimeZone(new Date(dayStartMs + minutesFromDayStart * 60_000), timezone, 'H:mm'),
    [dayStartMs, timezone],
  );

  // ── 還流導線 ──
  const calendarDayHref = `/${locale}/calendar/day?date=${format(currentDate, 'yyyy-MM-dd')}`;
  const tomorrowHref = `/${locale}/calendar/day?date=${format(addDays(currentDate, 1), 'yyyy-MM-dd')}`;

  if (entriesQuery.isError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
      </div>
    );
  }

  if (entriesQuery.isPending) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <EmptyState
          icon={CalendarClock}
          title={t('review.dayEmptyTitle')}
          description={t('review.dayEmptyDescription')}
          actionLabel={t('nextAction.recordDay')}
          onAction={() => router.push(calendarDayHref)}
          size="sm"
          centered
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          {insightText && <InsightSlot text={insightText} />}

          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={Clock3}
              label={t('overview.trackedTime')}
              value={formatMinutesDuration(summary.actualMinutes)}
              description={t('overview.trackedTimeDesc')}
              trend={trackedTrend}
            />
            <SummaryCard
              icon={Gauge}
              label={t('overview.planAccuracy')}
              value={
                summary.plannedMinutes > 0
                  ? `${Math.round(summary.planAccuracy * 100)}%`
                  : t('metrics.noData')
              }
              description={t('overview.planAccuracyDesc')}
              trend={accuracyTrend}
            />
            <SummaryCard
              icon={Smile}
              label={t('metrics.avgFulfillment')}
              value={
                summary.avgFulfillment != null
                  ? summary.avgFulfillment.toFixed(1)
                  : t('metrics.noData')
              }
              description={t('metrics.avgFulfillmentDesc')}
              trend={fulfillmentTrend}
            />
          </section>

          <OverviewPanel
            title={t('overview.planActual')}
            description={t('daily.timelineDesc')}
            icon={<CalendarClock className="size-4" />}
            action={
              <Link
                href={calendarDayHref}
                className="text-muted-foreground hover:text-foreground shrink-0 text-sm transition-colors duration-150"
              >
                {t('daily.openCalendar')}
              </Link>
            }
          >
            <DayTimelineComparison
              planned={toBlocks.planned}
              actual={toBlocks.actual}
              formatTime={formatTime}
            />
          </OverviewPanel>

          <NextActionLink href={tomorrowHref} label={t('nextAction.planTomorrow')} />
        </div>
      </div>
    </div>
  );
}
