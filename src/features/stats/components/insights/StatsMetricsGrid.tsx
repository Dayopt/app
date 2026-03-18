'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { api } from '@/platform/trpc';

import { METRIC_DEFINITIONS, METRIC_ORDER } from '../../lib/metricDefinitions';
import {
  calculatePeakUtilization,
  formatMetricValueParts,
  getMetricProgress,
  getMetricTrend,
  getThresholdStatus,
} from '../../lib/metrics';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import type { EnergyMapRow, MetricData, MetricId, MetricTrend } from '../../types/metrics.types';
import { computePreviousDateRange, computeStatsDateRange } from '../../utils/computeDateRange';
import { MetricCard } from '../metrics/MetricCard';

/** エネルギーマップからピーク活用率を算出するヘルパー */
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

/** 見積もり精度データから加重平均偏差（分）を算出するヘルパー */
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

/** 前期間比のトレンドを算出（null安全） */
function computeTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  trendPositive: 'up' | 'down' | 'neutral',
): MetricTrend | null {
  if (current == null || previous == null) return null;
  return getMetricTrend(current, previous, trendPositive);
}

/**
 * StatsMetricsGrid — KPIメトリクスをグリッド表示
 *
 * METRIC_ORDER でループ描画。前期間比較の TrendBadge を自動計算。
 */
export function StatsMetricsGrid() {
  const t = useTranslations('calendar.stats.metrics');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity),
    [currentDate, granularity],
  );
  const prevDateRange = useMemo(
    () => computePreviousDateRange(currentDate, granularity),
    [currentDate, granularity],
  );

  // === 現在期間のクエリ ===
  const cumulativeTime = api.entries.getCumulativeTime.useQuery(dateRange);
  const avgFulfillmentQuery = api.entries.getAvgFulfillment.useQuery(dateRange);
  const planRate = api.entries.getPlanRate.useQuery(dateRange);
  const estimationAccuracy = api.entries.getEstimationAccuracy.useQuery(dateRange);
  const energyMap = api.entries.getEnergyMap.useQuery(dateRange);
  const contextSwitches = api.entries.getContextSwitches.useQuery(dateRange);
  const blankRate = api.entries.getBlankRate.useQuery(dateRange);

  // === 前期間のクエリ（TrendBadge 用） ===
  const prevCumulativeTime = api.entries.getCumulativeTime.useQuery(prevDateRange);
  const prevAvgFulfillment = api.entries.getAvgFulfillment.useQuery(prevDateRange);
  const prevPlanRate = api.entries.getPlanRate.useQuery(prevDateRange);
  const prevEstimationAccuracy = api.entries.getEstimationAccuracy.useQuery(prevDateRange);
  const prevEnergyMap = api.entries.getEnergyMap.useQuery(prevDateRange);
  const prevContextSwitches = api.entries.getContextSwitches.useQuery(prevDateRange);
  const prevBlankRate = api.entries.getBlankRate.useQuery(prevDateRange);

  const isLoading =
    cumulativeTime.isPending ||
    avgFulfillmentQuery.isPending ||
    planRate.isPending ||
    estimationAccuracy.isPending ||
    energyMap.isPending ||
    contextSwitches.isPending ||
    blankRate.isPending;

  // ピーク活用率（現在・前期間）
  const peakUtilization = useMemo(
    () => computePeakFromEnergyMap(energyMap.data, dateRange.startDate, dateRange.endDate),
    [energyMap.data, dateRange.startDate, dateRange.endDate],
  );
  const prevPeakUtilization = useMemo(
    () =>
      computePeakFromEnergyMap(prevEnergyMap.data, prevDateRange.startDate, prevDateRange.endDate),
    [prevEnergyMap.data, prevDateRange.startDate, prevDateRange.endDate],
  );

  // 見積もり精度（現在・前期間）
  const avgDeviation = useMemo(
    () => computeAvgDeviation(estimationAccuracy.data),
    [estimationAccuracy.data],
  );
  const prevAvgDeviation = useMemo(
    () => computeAvgDeviation(prevEstimationAccuracy.data),
    [prevEstimationAccuracy.data],
  );

  // tRPCクエリ結果を Record<MetricId, MetricData> に正規化
  const metricsMap = useMemo((): Partial<Record<MetricId, MetricData>> => {
    const map: Partial<Record<MetricId, MetricData>> = {};

    if (cumulativeTime.data) {
      map.totalTime = {
        id: 'totalTime',
        value: cumulativeTime.data.totalMinutes,
        trend: computeTrend(
          cumulativeTime.data.totalMinutes,
          prevCumulativeTime.data?.totalMinutes,
          'up',
        ),
      };
    }

    if (avgFulfillmentQuery.data?.avgFulfillment != null) {
      map.avgFulfillment = {
        id: 'avgFulfillment',
        value: avgFulfillmentQuery.data.avgFulfillment,
        trend: computeTrend(
          avgFulfillmentQuery.data.avgFulfillment,
          prevAvgFulfillment.data?.avgFulfillment,
          'up',
        ),
      };
    }

    if (planRate.data) {
      map.planRate = {
        id: 'planRate',
        value: planRate.data.planRate,
        trend: computeTrend(planRate.data.planRate, prevPlanRate.data?.planRate, 'up'),
      };
    }

    // TODO: streak — getStreak エンドポイント接続後に有効化
    map.streak = { id: 'streak', value: null, trend: null };

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

    if (contextSwitches.data) {
      map.contextSwitches = {
        id: 'contextSwitches',
        value: contextSwitches.data.avgPerDay,
        trend: computeTrend(
          contextSwitches.data.avgPerDay,
          prevContextSwitches.data?.avgPerDay,
          'down',
        ),
      };
    }

    if (blankRate.data) {
      map.blankRate = {
        id: 'blankRate',
        value: blankRate.data.blankRate,
        trend: computeTrend(blankRate.data.blankRate, prevBlankRate.data?.blankRate, 'neutral'),
      };
    }

    return map;
  }, [
    cumulativeTime.data,
    avgFulfillmentQuery.data,
    planRate.data,
    avgDeviation,
    peakUtilization,
    contextSwitches.data,
    blankRate.data,
    prevCumulativeTime.data,
    prevAvgFulfillment.data,
    prevPlanRate.data,
    prevAvgDeviation,
    prevPeakUtilization,
    prevContextSwitches.data,
    prevBlankRate.data,
  ]);

  // 値が存在するメトリクスのみ表示（未実装メトリクスのダッシュ表示を防ぐ）
  const activeMetrics = METRIC_ORDER.filter((id) => {
    const data = metricsMap[id];
    return data?.value != null;
  });

  if (activeMetrics.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {activeMetrics.map((id) => {
        const def = METRIC_DEFINITIONS[id];
        const data = metricsMap[id]!;
        const value = data.value!;
        const progress = getMetricProgress(value, def);
        const status = getThresholdStatus(value, def);

        return (
          <MetricCard
            key={id}
            label={t(id)}
            valueParts={formatMetricValueParts(value, def.format)}
            icon={def.icon}
            trend={data.trend || undefined}
            variant={def.variant ?? 'default'}
            progress={progress ?? undefined}
            progressStatus={status ?? undefined}
            isLoading={isLoading}
          />
        );
      })}
    </div>
  );
}
