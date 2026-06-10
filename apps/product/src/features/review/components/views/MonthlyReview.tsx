'use client';

import { BarChart3, CalendarDays, Clock3, Ruler } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { addMonths } from '@/lib/date/core';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { cn } from '@/lib/utils';

import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useStatsRuleInsight } from '../../hooks/useStatsRuleInsight';
import { useTagBalanceRows } from '../../hooks/useTagBalanceRows';
import { computeAvgDeviation, getMetricTrend } from '../../lib/metrics';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import type { ReviewViewProps } from '../../types/review.types';
import { EstimationAccuracyList } from '../month/EstimationAccuracyList';
import { MonthlyDailyChart } from '../month/MonthlyDailyChart';
import { TagBalancePanel } from '../review/TagBalancePanel';
import { NextActionLink } from '../shared/NextActionLink';
import { OverviewPanel } from '../shared/OverviewPanel';
import { RuleInsightSlot } from '../shared/RuleInsightSlot';
import { SummaryCard } from '../shared/SummaryCard';
import { formatMinutesDuration } from '../time-pl/data/timePL.presentation';

/**
 * MonthlyReview - 月次振り返りビュー（Patterns）
 *
 * 「どんな傾向・習慣があるか」に答えるパターン分析。
 * 所見 → KPI 行 → 日別の記録（月の波）→ タグバランス + 見積もり精度 → 還流導線
 * の順で構成する（review-granularity-redesign 設計書 §5.3）。
 */
export function MonthlyReview({ className }: ReviewViewProps) {
  const t = useTranslations('calendar.stats');
  const locale = useLocale();
  const router = useRouter();
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const timezone = useUserPreferenceStore((s) => s.timezone);

  const {
    data: pageData,
    isPending,
    isFetching,
    isError: isStatsError,
    dateRange,
  } = useReviewPageData();

  const insight = useStatsRuleInsight(pageData);
  const {
    rows: tagRows,
    isFallbackPending,
    isFallbackFetching,
    isFallbackError,
  } = useTagBalanceRows(pageData, dateRange, isStatsError);

  // ── 月内の日別データ（dailyHours は年スコープなので月範囲に filter）──
  const dailyHours = pageData?.dailyHours;
  const monthDaily = useMemo(() => {
    if (!dailyHours) return undefined;
    const startDay = formatInTimeZone(new Date(dateRange.startDate), timezone, 'yyyy-MM-dd');
    const endDay = formatInTimeZone(new Date(dateRange.endDate), timezone, 'yyyy-MM-dd');
    return dailyHours.filter((d) => d.day >= startDay && d.day <= endDay);
  }, [dailyHours, dateRange.startDate, dateRange.endDate, timezone]);

  const recordedDays = useMemo(
    () => (monthDaily ?? []).filter((d) => d.hours > 0).length,
    [monthDaily],
  );

  // ── KPI トレンド（先月比）──
  const trackedTrend =
    pageData && pageData.prevOverview.totalMinutes > 0
      ? getMetricTrend(pageData.overview.totalMinutes, pageData.prevOverview.totalMinutes, 'up')
      : null;

  const avgDeviation = useMemo(
    () => computeAvgDeviation(pageData?.estimationAccuracy),
    [pageData?.estimationAccuracy],
  );
  const prevAvgDeviation = useMemo(
    () => computeAvgDeviation(pageData?.prevEstimationAccuracy),
    [pageData?.prevEstimationAccuracy],
  );
  // ずれは符号付きなので「0 にどれだけ近いか」で比較する
  const estimationTrend =
    avgDeviation != null && prevAvgDeviation != null && Math.abs(prevAvgDeviation) > 0
      ? getMetricTrend(Math.abs(avgDeviation), Math.abs(prevAvgDeviation), 'down')
      : null;

  // ── 還流導線（来月の計画へ）──
  const nextMonthHref = `/${locale}/calendar/week?date=${format(addMonths(currentDate, 1), 'yyyy-MM')}-01`;

  // タグ詳細ルートをプリフェッチ
  const tagIds = useMemo(() => tagRows.map((tag) => tag.tagId), [tagRows]);
  useEffect(() => {
    for (const id of tagIds) {
      router.prefetch(`/${locale}/review/tags/${id}`);
    }
  }, [router, locale, tagIds]);

  const handleTagClick = (tagId: string) => {
    router.push(`/${locale}/review/tags/${tagId}`);
  };

  if (isStatsError && isFallbackError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
      </div>
    );
  }

  const isAllLoaded = !isPending && !isFallbackPending;
  const hasNoData = isAllLoaded && !isFetching && !isFallbackFetching && tagRows.length === 0;

  if (hasNoData) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <EmptyState
          icon={BarChart3}
          title={t('review.emptyTitle')}
          description={t('review.emptyDescription')}
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
          <RuleInsightSlot insight={insight} />

          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={Clock3}
              label={t('overview.trackedTime')}
              value={formatMinutesDuration(pageData?.overview.totalMinutes ?? 0)}
              description={t('overview.trackedTimeDesc')}
              trend={trackedTrend}
            />
            <SummaryCard
              icon={CalendarDays}
              label={t('overview.recordedDays')}
              value={t('overview.daysValue', { count: recordedDays })}
              description={t('overview.recordedDaysDesc')}
            />
            <SummaryCard
              icon={Ruler}
              label={t('metrics.estimationAccuracy')}
              value={avgDeviation != null ? formatSignedMinutes(avgDeviation) : t('metrics.noData')}
              description={t('metrics.estimationAccuracyDesc')}
              trend={estimationTrend}
            />
          </section>

          <OverviewPanel
            title={t('monthly.dailyTitle')}
            description={t('monthly.dailyDesc')}
            icon={<BarChart3 className="size-4" />}
          >
            <MonthlyDailyChart data={monthDaily} isLoading={isPending && !isStatsError} />
          </OverviewPanel>

          <section className="grid gap-4 lg:grid-cols-2">
            <OverviewPanel
              title={t('overview.tagTime')}
              description={t('overview.tagTimeDesc')}
              icon={<BarChart3 className="size-4" />}
            >
              <TagBalancePanel rows={tagRows} onTagClick={handleTagClick} />
            </OverviewPanel>

            <OverviewPanel
              title={t('monthly.estimationTitle')}
              description={t('monthly.estimationDesc')}
              icon={<Ruler className="size-4" />}
            >
              <EstimationAccuracyList
                rows={pageData?.estimationAccuracy}
                isLoading={isPending && !isStatsError}
              />
            </OverviewPanel>
          </section>

          <NextActionLink href={nextMonthHref} label={t('nextAction.planNextMonth')} />
        </div>
      </div>
    </div>
  );
}

function formatSignedMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return '±0';
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatMinutesDuration(Math.abs(rounded))}`;
}
