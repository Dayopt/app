'use client';

import { BarChart3 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { useStatsPageData } from '../hooks/useStatsPageData';
import { calculateDeepUtilization } from '../lib/metrics';
import { evaluateRuleInsights } from '../lib/ruleInsights';
import type { MetricId } from '../types/metrics.types';
import type { StatsViewProps } from '../types/stats.types';
import { StatsMetricsGrid } from './insights/StatsMetricsGrid';
import { RuleInsightList } from './review/RuleInsightList';
import { TagBreakdownBar } from './review/TagBreakdownBar';

/**
 * StatsView - 振り返りビュー（Review タブ）
 *
 * 統合クエリ getStatsPageData から全データを取得。
 * 上から: タグ別内訳 → KPIメトリクス → 気づき
 */
export function StatsView({ className }: StatsViewProps) {
  const t = useTranslations('calendar.stats');
  const locale = useLocale();
  const router = useRouter();

  const {
    data: pageData,
    isPending,
    isFetching,
    isError,
    dateRange,
    prevDateRange,
  } = useStatsPageData();

  const tagSegments = pageData?.timeByTag
    ? pageData.timeByTag.map((tag) => ({
        tagId: tag.tagId,
        tagName: tag.name,
        tagColor: resolveTagColor(tag.color),
        minutes: Math.round(tag.hours * 60),
      }))
    : [];

  // タグ詳細ルートをプリフェッチ（クリック前にRSCペイロードを準備）
  const tagIds = useMemo(
    () => pageData?.timeByTag?.map((tag) => tag.tagId) ?? [],
    [pageData?.timeByTag],
  );
  useEffect(() => {
    for (const id of tagIds) {
      router.prefetch(`/${locale}/stats/tags/${id}`);
    }
  }, [router, locale, tagIds]);

  const handleTagClick = (tagId: string) => {
    router.push(`/${locale}/stats/tags/${tagId}`);
  };

  const ruleInsights = useMemo(() => {
    if (!pageData) return [];
    const current: Partial<Record<MetricId, number>> = {};

    current.entryRate = pageData.overview.planRate;
    current.contextSwitches = pageData.contextSwitches.avgPerDay;
    current.blankRate = pageData.blankRate.blankRate;

    // ピーク活用率
    if (pageData.energyMap.length > 0 && dateRange.startDate && dateRange.endDate) {
      const defaultDeepZones = [{ startHour: 9, endHour: 14 }];
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      const daysInRange = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const deep = calculateDeepUtilization(pageData.energyMap, defaultDeepZones, daysInRange);
      if (deep) current.deepUtilization = deep.deepUtilization;
    }

    // 見積もり精度
    if (pageData.estimationAccuracy.length > 0) {
      const totalDev = pageData.estimationAccuracy.reduce(
        (sum, item) => sum + item.avgDeviationMinutes * item.entryCount,
        0,
      );
      const totalEntries = pageData.estimationAccuracy.reduce(
        (sum, item) => sum + item.entryCount,
        0,
      );
      if (totalEntries > 0) current.estimationAccuracy = totalDev / totalEntries;
    }

    return evaluateRuleInsights(current, null);
  }, [pageData, dateRange.startDate, dateRange.endDate]);

  // エラー状態
  if (isError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
      </div>
    );
  }

  // 空状態判定
  const isAllLoaded = !isPending;
  const hasNoData = isAllLoaded && !isFetching && tagSegments.length === 0;

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
          {/* タグ別時間内訳 */}
          <TagBreakdownBar segments={tagSegments} onTagClick={handleTagClick} />

          {/* KPI メトリクス */}
          <StatsMetricsGrid
            pageData={pageData}
            dateRange={dateRange}
            prevDateRange={prevDateRange}
          />

          {/* 閾値ベースの気づき */}
          <RuleInsightList insights={ruleInsights} />
        </div>
      </div>
    </div>
  );
}
