'use client';

import { useMemo } from 'react';

import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { METRIC_DEFINITIONS, METRIC_ORDER } from '../lib/metricDefinitions';
import {
  calculatePeakUtilization,
  formatMetricValueParts,
  getMetricProgress,
  getMetricTrend,
  getThresholdStatus,
} from '../lib/metrics';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import type { EnergyMapRow, MetricData, MetricId, MetricTrend } from '../types/metrics.types';
import { computePreviousDateRange, computeStatsDateRange } from '../utils/computeDateRange';

// =============================================================================
// Helpers
// =============================================================================

function computePeakFromEnergyMap(
  data: EnergyMapRow[] | undefined,
  startDate: string,
  endDate: string,
) {
  if (!data || !startDate || !endDate) return null;
  const defaultPeakZones = [{ startHour: 9, endHour: 14 }];
  const s = new Date(startDate);
  const e = new Date(endDate);
  const daysInRange = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  return calculatePeakUtilization(data, defaultPeakZones, daysInRange);
}

function computeAvgDeviation(
  data: { avgDeviationMinutes: number; entryCount: number }[] | undefined,
): number | null {
  if (!data || data.length === 0) return null;
  const totalDeviation = data.reduce(
    (sum, item) => sum + item.avgDeviationMinutes * item.entryCount,
    0,
  );
  const totalEntries = data.reduce((sum, item) => sum + item.entryCount, 0);
  return totalEntries > 0 ? totalDeviation / totalEntries : 0;
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

interface StatsMetricCard {
  id: MetricId;
  label: string;
  valueParts: ReturnType<typeof formatMetricValueParts>;
  icon: React.ComponentType<{ className?: string }>;
  trend: MetricTrend | undefined;
  variant: 'hero' | 'default';
  progress: number | undefined;
  progressStatus: 'good' | 'warning' | 'critical' | undefined;
}

/** useStatsMetrics の戻り値型 */
export interface UseStatsMetricsResult {
  /** レンダリング可能なメトリクスカードデータ */
  cards: StatsMetricCard[];
  /** いずれかの統合クエリが読み込み中 */
  isLoading: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useStatsMetrics — KPI メトリクスの取得・正規化・フォーマットを一括処理
 *
 * 統合エンドポイント `getStatsOverview` を使い、14→2クエリに削減。
 * estimationAccuracy と energyMap（peakUtilization）は個別クエリが必要。
 */
export function useStatsMetrics(t: (key: string) => string): UseStatsMetricsResult {
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );
  const prevDateRange = useMemo(
    () => computePreviousDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  // === 統合クエリ（5 KPI を 1 RPC で取得） ===
  const overview = api.entries.getStatsOverview.useQuery(dateRange);
  const prevOverview = api.entries.getStatsOverview.useQuery(prevDateRange);

  // === 個別クエリ（統合に含められないもの） ===
  const estimationAccuracy = api.entries.getEstimationAccuracy.useQuery(dateRange);
  const prevEstimationAccuracy = api.entries.getEstimationAccuracy.useQuery(prevDateRange);
  const energyMap = api.entries.getEnergyMap.useQuery(dateRange);
  const prevEnergyMap = api.entries.getEnergyMap.useQuery(prevDateRange);
  const streakQuery = api.entries.getStreak.useQuery();

  const isLoading = overview.isPending || estimationAccuracy.isPending || energyMap.isPending;

  // ピーク活用率
  const peakUtilization = useMemo(
    () => computePeakFromEnergyMap(energyMap.data, dateRange.startDate, dateRange.endDate),
    [energyMap.data, dateRange.startDate, dateRange.endDate],
  );
  const prevPeakUtilization = useMemo(
    () =>
      computePeakFromEnergyMap(prevEnergyMap.data, prevDateRange.startDate, prevDateRange.endDate),
    [prevEnergyMap.data, prevDateRange.startDate, prevDateRange.endDate],
  );

  // 見積もり精度
  const avgDeviation = useMemo(
    () => computeAvgDeviation(estimationAccuracy.data),
    [estimationAccuracy.data],
  );
  const prevAvgDeviation = useMemo(
    () => computeAvgDeviation(prevEstimationAccuracy.data),
    [prevEstimationAccuracy.data],
  );

  // メトリクスマップ構築
  const metricsMap = useMemo((): Partial<Record<MetricId, MetricData>> => {
    const map: Partial<Record<MetricId, MetricData>> = {};
    const cur = overview.data;
    const prev = prevOverview.data;

    if (cur?.cumulativeTime) {
      map.totalTime = {
        id: 'totalTime',
        value: cur.cumulativeTime.totalMinutes,
        trend: computeTrend(
          cur.cumulativeTime.totalMinutes,
          prev?.cumulativeTime?.totalMinutes,
          'up',
        ),
      };
    }

    if (cur?.avgFulfillment?.avgFulfillment != null) {
      map.avgFulfillment = {
        id: 'avgFulfillment',
        value: cur.avgFulfillment.avgFulfillment,
        trend: computeTrend(
          cur.avgFulfillment.avgFulfillment,
          prev?.avgFulfillment?.avgFulfillment,
          'up',
        ),
      };
    }

    if (cur?.entryRate) {
      map.entryRate = {
        id: 'entryRate',
        value: cur.entryRate.entryRate,
        trend: computeTrend(cur.entryRate.entryRate, prev?.entryRate?.entryRate, 'up'),
      };
    }

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

    if (peakUtilization) {
      map.peakUtilization = {
        id: 'peakUtilization',
        value: peakUtilization.peakUtilization,
        trend: computeTrend(
          peakUtilization.peakUtilization,
          prevPeakUtilization?.peakUtilization,
          'up',
        ),
      };
    }

    if (cur?.contextSwitches) {
      map.contextSwitches = {
        id: 'contextSwitches',
        value: cur.contextSwitches.avgPerDay,
        trend: computeTrend(
          cur.contextSwitches.avgPerDay,
          prev?.contextSwitches?.avgPerDay,
          'down',
        ),
      };
    }

    if (cur?.blankRate) {
      map.blankRate = {
        id: 'blankRate',
        value: cur.blankRate.blankRate,
        trend: computeTrend(cur.blankRate.blankRate, prev?.blankRate?.blankRate, 'neutral'),
      };
    }

    return map;
  }, [
    overview.data,
    prevOverview.data,
    avgDeviation,
    prevAvgDeviation,
    peakUtilization,
    prevPeakUtilization,
    streakQuery.data,
  ]);

  // アクティブなメトリクスのみカード化
  const cards = useMemo((): StatsMetricCard[] => {
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
