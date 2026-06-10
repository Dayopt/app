'use client';

import { BarChart3, CalendarDays, Clock3, Flame, Map } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useTagBalanceRows } from '../../hooks/useTagBalanceRows';
import { getMetricTrend } from '../../lib/metrics';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import type { ReviewViewProps } from '../../types/review.types';
import { TagBalancePanel } from '../review/TagBalancePanel';
import { InsightSlot } from '../shared/InsightSlot';
import { OverviewPanel } from '../shared/OverviewPanel';
import { SummaryCard } from '../shared/SummaryCard';
import { formatMinutesDuration } from '../time-pl/data/timePL.presentation';
import { MonthlyTrendChart } from '../year/MonthlyTrendChart';
import { YearHeatmap } from '../year/YearHeatmap';

/**
 * YearlyReview - 年次振り返りビュー（Map Overview）
 *
 * 「1年分の時間の地図」を俯瞰するビュー。詳細リストは置かない。
 * 所見（年間ハイライト）→ KPI 行 → 年間ヒートマップ → 月別推移 + タグ構成
 * の順で構成する（review-granularity-redesign 設計書 §5.4）。
 */
export function YearlyReview({ className }: ReviewViewProps) {
  const t = useTranslations('calendar.stats');
  const locale = useLocale();
  const router = useRouter();
  const currentDate = useReviewFilterStore((s) => s.currentDate);

  const {
    data: pageData,
    isPending,
    isFetching,
    isError: isStatsError,
    dateRange,
  } = useReviewPageData();

  const {
    rows: tagRows,
    isFallbackPending,
    isFallbackFetching,
    isFallbackError,
  } = useTagBalanceRows(pageData, dateRange, isStatsError);
  const streakQuery = api.entries.getStreak.useQuery();

  // ── 年間ハイライト（最も時間を使ったタグの事実提示）──
  const topTag = tagRows[0] ?? null;
  const insightText = topTag
    ? t('insights.periodTopTag', {
        tag: topTag.tagName,
        hours: Math.round(topTag.minutes / 60),
      })
    : null;

  // ── KPI ──
  const trackedTrend =
    pageData && pageData.prevOverview.totalMinutes > 0
      ? getMetricTrend(pageData.overview.totalMinutes, pageData.prevOverview.totalMinutes, 'up')
      : null;
  const recordedDays = useMemo(
    () => (pageData?.dailyHours ?? []).filter((d) => d.hours > 0).length,
    [pageData?.dailyHours],
  );
  const streak = streakQuery.data?.streak ?? null;

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
          {insightText && <InsightSlot text={insightText} />}

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
              icon={Flame}
              label={t('metrics.streak')}
              value={
                streak != null ? t('overview.daysValue', { count: streak }) : t('metrics.noData')
              }
              description={t('metrics.streakDesc')}
            />
          </section>

          <OverviewPanel
            title={t('yearly.heatmapTitle')}
            description={t('yearly.heatmapDesc')}
            icon={<Map className="size-4" />}
          >
            <YearHeatmap
              data={pageData?.dailyHours}
              year={currentDate.getFullYear()}
              isLoading={isPending && !isStatsError}
            />
          </OverviewPanel>

          <section className="grid gap-4 lg:grid-cols-2">
            <OverviewPanel
              title={t('yearly.monthlyTitle')}
              description={t('yearly.monthlyDesc')}
              icon={<BarChart3 className="size-4" />}
            >
              <MonthlyTrendChart
                data={pageData?.monthlyTrend}
                isLoading={isPending && !isStatsError}
              />
            </OverviewPanel>

            <OverviewPanel
              title={t('overview.tagTime')}
              description={t('overview.tagTimeDesc')}
              icon={<BarChart3 className="size-4" />}
            >
              <TagBalancePanel rows={tagRows} onTagClick={handleTagClick} />
            </OverviewPanel>
          </section>
        </div>
      </div>
    </div>
  );
}
