'use client';

import { useMemo } from 'react';

import { api } from '@/lib/trpc';

import { METRIC_DEFINITIONS, METRIC_ORDER } from '../lib/metricDefinitions';
import {
  calculateDeepUtilization,
  computeAvgDeviation,
  formatMetricValueParts,
  getMetricProgress,
  getMetricTrend,
  getThresholdStatus,
} from '../lib/metrics';
import type {
  EnergyMapRow,
  MetricData,
  MetricId,
  MetricTrend,
  StatsPageData,
} from '../types/metrics.types';

// =============================================================================
// Helpers
// =============================================================================

function computeDeepFromEnergyMap(
  data: EnergyMapRow[] | undefined,
  startDate: string,
  endDate: string,
) {
  if (!data || !startDate || !endDate) return null;
  const defaultDeepZones = [{ startHour: 9, endHour: 14 }];
  const s = new Date(startDate);
  const e = new Date(endDate);
  const daysInRange = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  return calculateDeepUtilization(data, defaultDeepZones, daysInRange);
}

function computeTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  trendPositive: 'up' | 'down' | 'neutral',
): MetricTrend | null {
  if (current == null || previous == null) return null;
  return getMetricTrend(current, previous, trendPositive);
}

// =============================================================================
// Hook Return Type
// =============================================================================

interface ReviewMetricCard {
  id: MetricId;
  label: string;
  valueParts: ReturnType<typeof formatMetricValueParts>;
  icon: React.ComponentType<{ className?: string }>;
  trend: MetricTrend | undefined;
  variant: 'hero' | 'default';
  progress: number | undefined;
  progressStatus: 'good' | 'warning' | 'critical' | undefined;
}

/** useReviewMetrics の戻り値型 */
interface UseStatsMetricsResult {
  /** レンダリング可能なメトリクスカードデータ */
  cards: ReviewMetricCard[];
  /** いずれかの統合クエリが読み込み中 */
  isLoading: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useReviewMetrics — KPI メトリクスの取得・正規化・フォーマットを一括処理
 *
 * 統合エンドポイント `getStatsPageData` から全データを受け取り、
 * 8 メトリクスをカード用に正規化する。
 */
export function useReviewMetrics(
  t: (key: string) => string,
  pageData: StatsPageData | undefined,
  dateRange: { startDate: string; endDate: string },
  prevDateRange: { startDate: string; endDate: string },
): UseStatsMetricsResult {
  const streakQuery = api.entries.getStreak.useQuery();

  const isLoading = !pageData;

  // ピーク活用率
  const deepUtilization = useMemo(
    () => computeDeepFromEnergyMap(pageData?.energyMap, dateRange.startDate, dateRange.endDate),
    [pageData?.energyMap, dateRange.startDate, dateRange.endDate],
  );
  const prevDeepUtilization = useMemo(
    () =>
      computeDeepFromEnergyMap(
        pageData?.prevEnergyMap,
        prevDateRange.startDate,
        prevDateRange.endDate,
      ),
    [pageData?.prevEnergyMap, prevDateRange.startDate, prevDateRange.endDate],
  );

  // 見積もり精度
  const avgDeviation = useMemo(
    () => computeAvgDeviation(pageData?.estimationAccuracy),
    [pageData?.estimationAccuracy],
  );
  const prevAvgDeviation = useMemo(
    () => computeAvgDeviation(pageData?.prevEstimationAccuracy),
    [pageData?.prevEstimationAccuracy],
  );

  // メトリクスマップ構築
  const metricsMap = useMemo((): Partial<Record<MetricId, MetricData>> => {
    const map: Partial<Record<MetricId, MetricData>> = {};
    if (!pageData) return map;

    const cur = pageData.overview;
    const prev = pageData.prevOverview;

    map.totalTime = {
      id: 'totalTime',
      value: cur.totalMinutes,
      trend: computeTrend(cur.totalMinutes, prev.totalMinutes, 'up'),
    };

    map.entryRate = {
      id: 'entryRate',
      value: cur.planRate,
      trend: computeTrend(cur.planRate, prev.planRate, 'up'),
    };

    if (streakQuery.data) {
      map.streak = {
        id: 'streak',
        value: streakQuery.data.streak,
        trend: null,
      };
    }

    if (avgDeviation !== null) {
      map.estimationAccuracy = {
        id: 'estimationAccuracy',
        value: avgDeviation,
        trend: computeTrend(avgDeviation, prevAvgDeviation, 'down'),
      };
    }

    if (deepUtilization) {
      map.deepUtilization = {
        id: 'deepUtilization',
        value: deepUtilization.deepUtilization,
        trend: computeTrend(
          deepUtilization.deepUtilization,
          prevDeepUtilization?.deepUtilization,
          'up',
        ),
      };
    }

    map.contextSwitches = {
      id: 'contextSwitches',
      value: pageData.contextSwitches.avgPerDay,
      trend: computeTrend(pageData.contextSwitches.avgPerDay, undefined, 'down'),
    };

    map.blankRate = {
      id: 'blankRate',
      value: pageData.blankRate.blankRate,
      trend: computeTrend(pageData.blankRate.blankRate, undefined, 'neutral'),
    };

    return map;
  }, [
    pageData,
    avgDeviation,
    prevAvgDeviation,
    deepUtilization,
    prevDeepUtilization,
    streakQuery.data,
  ]);

  // アクティブなメトリクスのみカード化
  const cards = useMemo((): ReviewMetricCard[] => {
    return METRIC_ORDER.filter((id) => metricsMap[id]?.value != null).map((id) => {
      const def = METRIC_DEFINITIONS[id];
      const data = metricsMap[id]!;
      const value = data.value!;
      return {
        id,
        label: t(id),
        valueParts: formatMetricValueParts(value, def.format),
        icon: def.icon,
        trend: data.trend || undefined,
        variant: def.variant ?? 'default',
        progress: getMetricProgress(value, def) ?? undefined,
        progressStatus: getThresholdStatus(value, def) ?? undefined,
      };
    });
  }, [metricsMap, t]);

  return { cards, isLoading };
}
