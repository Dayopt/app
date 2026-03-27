'use client';

import { BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { calculateDeepUtilization } from '../lib/metrics';
import { evaluateRuleInsights } from '../lib/ruleInsights';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import type { MetricId } from '../types/metrics.types';
import type { StatsViewProps } from '../types/stats.types';
import { computeStatsDateRange } from '../utils/computeDateRange';
import { StatsMetricsGrid } from './insights/StatsMetricsGrid';
import { RuleInsightList } from './review/RuleInsightList';
import { TagBreakdownBar } from './review/TagBreakdownBar';

/**
 * StatsView - 振り返りビュー（Review タブ）
 *
 * 上から: タグ別内訳 → KPIメトリクス → 気づき
 * 「何に時間を使った → 数値 → 改善ヒント」のストーリー構成。
 */
export function StatsView({ className }: StatsViewProps) {
  const t = useTranslations('calendar.stats');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  // タグ別内訳
  const timeByTag = api.entries.getTimeByTag.useQuery(dateRange);

  const tagSegments = useMemo(() => {
    if (!timeByTag.data) return [];
    return timeByTag.data.map((tag) => ({
      tagName: tag.name,
      tagColor: resolveTagColor(tag.color),
      minutes: Math.round(tag.hours * 60),
    }));
  }, [timeByTag.data]);

  // RuleInsightList 用: TanStack Query がキャッシュを共有するため重複リクエストは発生しない
  const entryRate = api.entries.getEntryRate.useQuery(dateRange);
  const estimationAccuracy = api.entries.getEstimationAccuracy.useQuery(dateRange);
  const energyMap = api.entries.getEnergyMap.useQuery(dateRange);
  const contextSwitches = api.entries.getContextSwitches.useQuery(dateRange);
  const blankRate = api.entries.getBlankRate.useQuery(dateRange);

  const ruleInsights = useMemo(() => {
    const current: Partial<Record<MetricId, number>> = {};

    if (entryRate.data) current.entryRate = entryRate.data.entryRate;
    if (contextSwitches.data) current.contextSwitches = contextSwitches.data.avgPerDay;
    if (blankRate.data) current.blankRate = blankRate.data.blankRate;

    // ピーク活用率
    if (energyMap.data && dateRange.startDate && dateRange.endDate) {
      const defaultDeepZones = [{ startHour: 9, endHour: 14 }];
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      const daysInRange = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const deep = calculateDeepUtilization(energyMap.data, defaultDeepZones, daysInRange);
      if (deep) current.deepUtilization = deep.deepUtilization;
    }

    // 見積もり精度
    if (estimationAccuracy.data && estimationAccuracy.data.length > 0) {
      const totalDev = estimationAccuracy.data.reduce(
        (sum, item) => sum + item.avgDeviationMinutes * item.entryCount,
        0,
      );
      const totalEntries = estimationAccuracy.data.reduce((sum, item) => sum + item.entryCount, 0);
      if (totalEntries > 0) current.estimationAccuracy = totalDev / totalEntries;
    }

    // 前期間比較は未実装のため null
    return evaluateRuleInsights(current, null);
  }, [
    entryRate.data,
    estimationAccuracy.data,
    energyMap.data,
    contextSwitches.data,
    blankRate.data,
    dateRange.startDate,
    dateRange.endDate,
  ]);

  // 全クエリがロード完了かつデータが空の場合に空状態を表示
  // エラー・フェッチ中は空状態を表示しない（エラーは FeatureErrorBoundary に委任）
  const isAllLoaded = !timeByTag.isPending && !entryRate.isPending;
  const isFetching = timeByTag.isFetching || entryRate.isFetching;
  const hasError = timeByTag.isError || entryRate.isError;
  const hasNoData = isAllLoaded && !isFetching && !hasError && tagSegments.length === 0;

  if (hasNoData) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <BarChart3 className="text-muted-foreground size-10" />
          <div className="text-center">
            <p className="text-foreground text-sm font-medium">{t('emptyTitle')}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t('emptyDescription')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          {/* タグ別時間内訳 */}
          <TagBreakdownBar segments={tagSegments} />

          {/* KPI メトリクス */}
          <StatsMetricsGrid />

          {/* 閾値ベースの気づき（問題がある場合のみ表示） */}
          <RuleInsightList insights={ruleInsights} />
        </div>
      </div>
    </div>
  );
}
