'use client';

import { BarChart3, CalendarClock, CalendarDays, Clock3, Gauge, Trophy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { resolveTagColor, TagIcon } from '@/features/tags';
import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { addWeeks } from '@/lib/date/core';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import {
  deriveAccuracy,
  deriveBarComparison,
  deriveStatement,
} from '@/features/review/domain/timePL/derivers';
import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useTimePLData } from '../../hooks/useTimePLData';
import { getMetricTrend } from '../../lib/metrics';
import { evaluateRuleInsights, type MetricValues } from '../../lib/ruleInsights';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import type { ReviewViewProps } from '../../types/review.types';
import { DowRhythmChart, HourlyRhythmChart } from '../review/RhythmCharts';
import { TagBreakdownBar } from '../review/TagBreakdownBar';
import { InsightSlot } from '../shared/InsightSlot';
import { NextActionLink } from '../shared/NextActionLink';
import { OverviewPanel } from '../shared/OverviewPanel';
import { SummaryCard } from '../shared/SummaryCard';
import { formatMinutesDuration } from '../time-pl/data/timePL.presentation';
import { BarComparisonView } from '../time-pl/views/BarComparisonView';

interface TagSummaryRow {
  tagId: string;
  tagName: string;
  tagColor: ReturnType<typeof resolveTagColor>;
  tagIcon: string | null;
  minutes: number;
  percentage: number;
}

/**
 * WeeklyReview - 週次振り返りビュー
 *
 * 「時間をどこに使い、計画とどれだけずれたか」に答える振り返りの主戦場。
 * 所見 → KPI 行 → Time P/L（主役）+ タグバランス → 週のリズム → 還流導線
 * の順で構成する（review-granularity-redesign 設計書 §5.2）。
 */
export function WeeklyReview({ className }: ReviewViewProps) {
  const t = useTranslations('calendar.stats');
  const tCommon = useTranslations('common');
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

  const { data: timePLData, isPending: isTimePLPending, isError: isTimePLError } = useTimePLData();
  const fallbackTimeByTagQuery = api.entries.getTimeByTag.useQuery(
    {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    {
      enabled: isStatsError || !pageData?.timeByTag?.length,
    },
  );

  // ── Time P/L 導出 ──
  const statement = useMemo(() => (timePLData ? deriveStatement(timePLData) : null), [timePLData]);
  const accuracy = useMemo(() => (timePLData ? deriveAccuracy(timePLData) : null), [timePLData]);
  const barRows = useMemo(() => (timePLData ? deriveBarComparison(timePLData) : []), [timePLData]);

  // ── タグバランス ──
  const totalTrackedMinutes = pageData?.overview.totalMinutes ?? statement?.actualTotal ?? 0;
  const fallbackTimeByTag = fallbackTimeByTagQuery.data;
  const timeByTag = pageData?.timeByTag?.length ? pageData.timeByTag : fallbackTimeByTag;
  const tagRows = useMemo<TagSummaryRow[]>(() => {
    if (!timeByTag && !timePLData) return [];

    const rows = timeByTag
      ? timeByTag.map((tag) => {
          const minutes = Math.round(tag.hours * 60);
          return {
            tagId: tag.tagId,
            tagName: tag.name,
            tagColor: resolveTagColor(tag.color),
            tagIcon: null,
            minutes,
          };
        })
      : (timePLData?.tags.map((tag) => ({
          tagId: tag.tagId,
          tagName: tag.tagName,
          tagColor: tag.tagColor,
          tagIcon: tag.tagIcon ?? null,
          minutes: tag.actualMinutes,
        })) ?? []);

    return rows
      .filter((tag) => tag.minutes > 0)
      .map((tag) => ({
        ...tag,
        percentage:
          totalTrackedMinutes > 0 ? Math.round((tag.minutes / totalTrackedMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [timeByTag, timePLData, totalTrackedMinutes]);

  const tagSegments = tagRows.map((tag) => ({
    tagId: tag.tagId,
    tagName: tag.tagName,
    tagColor: tag.tagColor,
    tagIcon: tag.tagIcon,
    minutes: tag.minutes,
  }));
  const topTag = tagRows[0] ?? null;

  // ── KPI トレンド（前の同期間の自分とだけ比較する）──
  const trackedTrend =
    pageData && pageData.prevOverview.totalMinutes > 0
      ? getMetricTrend(pageData.overview.totalMinutes, pageData.prevOverview.totalMinutes, 'up')
      : null;
  const accuracyTrend =
    accuracy?.prevRate != null ? getMetricTrend(accuracy.rate, accuracy.prevRate, 'up') : null;

  // ── 研究者の所見（severity 最上位の 1 件だけ。なければ沈黙）──
  const insight = useMemo(() => {
    if (!pageData) return null;

    const current: MetricValues = {
      totalTime: pageData.overview.totalMinutes,
      entryRate: pageData.overview.planRate,
      contextSwitches: pageData.contextSwitches.avgPerDay,
      blankRate: pageData.blankRate.blankRate,
    };
    if (pageData.overview.avgFulfillment != null) {
      current.avgFulfillment = pageData.overview.avgFulfillment;
    }

    const previous: MetricValues = {
      totalTime: pageData.prevOverview.totalMinutes,
      entryRate: pageData.prevOverview.planRate,
    };
    if (pageData.prevOverview.avgFulfillment != null) {
      previous.avgFulfillment = pageData.prevOverview.avgFulfillment;
    }

    return evaluateRuleInsights(current, previous)[0] ?? null;
  }, [pageData]);

  const insightContent = useMemo(() => {
    if (!insight) return null;
    const params = { ...insight.messageParams };
    // trendWorse / trendBetter の {label} は英語定数なので locale 済みのメトリクス名に差し替える
    if (params.label != null) {
      params.label = t(`metrics.${insight.metricId}`);
    }
    return {
      text: t(`insights.${insight.messageKey}`, params),
      detail: insight.detailKey
        ? t(`insights.${insight.detailKey}`, insight.detailParams)
        : undefined,
    };
  }, [insight, t]);

  // ── 還流導線（来週の計画へ）──
  const nextWeekHref = `/${locale}/calendar/week?date=${format(addWeeks(currentDate, 1), 'yyyy-MM-dd')}`;

  // ── 週のリズム ──
  const weekdayLabels = tCommon.raw('dates.weekdaysNarrow') as string[];

  // タグ詳細ルートをプリフェッチ（クリック前にRSCペイロードを準備）
  const tagIds = useMemo(() => tagRows.map((tag) => tag.tagId), [tagRows]);
  useEffect(() => {
    for (const id of tagIds) {
      router.prefetch(`/${locale}/review/tags/${id}`);
    }
  }, [router, locale, tagIds]);

  const handleTagClick = (tagId: string) => {
    router.push(`/${locale}/review/tags/${tagId}`);
  };

  // エラー状態
  if (isStatsError && isTimePLError && fallbackTimeByTagQuery.isError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
      </div>
    );
  }

  // 空状態判定
  const isAllLoaded = !isPending && !isTimePLPending && !fallbackTimeByTagQuery.isPending;
  const hasNoData =
    isAllLoaded && !isFetching && !fallbackTimeByTagQuery.isFetching && tagSegments.length === 0;

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
          {insightContent && (
            <InsightSlot text={insightContent.text} detail={insightContent.detail} />
          )}

          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={Clock3}
              label={t('overview.trackedTime')}
              value={formatMinutesDuration(totalTrackedMinutes)}
              description={t('overview.trackedTimeDesc')}
              trend={trackedTrend}
            />
            <SummaryCard
              icon={Gauge}
              label={t('overview.planAccuracy')}
              value={
                accuracy && !isTimePLPending
                  ? `${Math.round(accuracy.rate * 100)}%`
                  : t('metrics.noData')
              }
              description={t('overview.planAccuracyDesc')}
              trend={accuracyTrend}
            />
            <SummaryCard
              icon={Trophy}
              label={t('overview.topTag')}
              value={topTag ? topTag.tagName : t('metrics.noData')}
              description={
                topTag
                  ? `${formatMinutesDuration(topTag.minutes)} / ${topTag.percentage}%`
                  : t('noTagData')
              }
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <OverviewPanel
              title={t('overview.planActual')}
              description={t('overview.planActualDesc')}
              icon={<CalendarClock className="size-4" />}
              className="lg:col-span-2"
            >
              {statement && barRows.length > 0 ? (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <PlanActualStat
                      label={t('overview.planned')}
                      value={formatMinutesDuration(statement.budgetTotal)}
                    />
                    <PlanActualStat
                      label={t('overview.actual')}
                      value={formatMinutesDuration(statement.actualTotal)}
                    />
                    <PlanActualStat
                      label={t('overview.diff')}
                      value={formatSignedDuration(statement.netVarianceMinutes)}
                      emphasized
                    />
                  </div>
                  <BarComparisonView rows={barRows} />
                </>
              ) : (
                <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
                  {t('metrics.noData')}
                </div>
              )}
            </OverviewPanel>

            <OverviewPanel
              title={t('overview.tagTime')}
              description={t('overview.tagTimeDesc')}
              icon={<BarChart3 className="size-4" />}
            >
              <TagBreakdownBar segments={tagSegments} onTagClick={handleTagClick} />
              <div className="divide-border mt-3 divide-y">
                {tagRows.map((tag) => (
                  <button
                    key={tag.tagId}
                    type="button"
                    className="hover:bg-state-hover flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
                    onClick={() => handleTagClick(tag.tagId)}
                  >
                    <TagIcon icon={tag.tagIcon ?? null} color={tag.tagColor} size="sm" />
                    <ColonTagLabel
                      name={tag.tagName}
                      className="text-foreground min-w-0 flex-1 truncate text-sm"
                    />
                    <span className="text-foreground font-mono text-sm tabular-nums">
                      {formatMinutesDuration(tag.minutes)}
                    </span>
                    <span className="text-muted-foreground w-10 text-right font-mono text-sm tabular-nums">
                      {tag.percentage}%
                    </span>
                  </button>
                ))}
              </div>
            </OverviewPanel>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <OverviewPanel
              title={t('rhythm.dayOfWeek')}
              description={t('rhythm.dayOfWeekDesc')}
              icon={<CalendarDays className="size-4" />}
            >
              <DowRhythmChart
                data={pageData?.dow}
                weekdayLabels={weekdayLabels}
                isLoading={isPending && !isStatsError}
              />
            </OverviewPanel>
            <OverviewPanel
              title={t('rhythm.hourly')}
              description={t('rhythm.hourlyDesc')}
              icon={<Clock3 className="size-4" />}
            >
              <HourlyRhythmChart data={pageData?.hourly} isLoading={isPending && !isStatsError} />
            </OverviewPanel>
          </section>

          <NextActionLink href={nextWeekHref} label={t('nextAction.planNextWeek')} />
        </div>
      </div>
    </div>
  );
}

function formatSignedDuration(minutes: number): string {
  if (minutes === 0) return '±0';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatMinutesDuration(Math.abs(minutes))}`;
}

function PlanActualStat({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          'mt-1 font-mono text-lg tabular-nums',
          emphasized ? 'text-foreground font-medium' : 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}
