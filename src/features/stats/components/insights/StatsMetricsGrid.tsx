'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { api } from '@/platform/trpc';

import { METRIC_DEFINITIONS, METRIC_ORDER } from '../../lib/metricDefinitions';
import {
  calculatePeakUtilization,
  formatMetricValueParts,
  getMetricProgress,
  getThresholdStatus,
} from '../../lib/metrics';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import type { MetricData, MetricId } from '../../types/metrics.types';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { MetricCard } from '../metrics/MetricCard';

/**
 * StatsMetricsGrid — 8つのKPIメトリクスをグリッド表示
 *
 * METRIC_ORDER でループ描画。新メトリクス追加は metricDefinitions.ts に1エントリ追加するだけ。
 */
export function StatsMetricsGrid() {
  const t = useTranslations('calendar.stats.metrics');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity),
    [currentDate, granularity],
  );

  // tRPCクエリを並列取得
  const cumulativeTime = api.entries.getCumulativeTime.useQuery(dateRange);
  const avgFulfillmentQuery = api.entries.getAvgFulfillment.useQuery(dateRange);
  const planRate = api.entries.getPlanRate.useQuery(dateRange);
  const estimationAccuracy = api.entries.getEstimationAccuracy.useQuery(dateRange);
  const energyMap = api.entries.getEnergyMap.useQuery(dateRange);
  const contextSwitches = api.entries.getContextSwitches.useQuery(dateRange);
  const blankRate = api.entries.getBlankRate.useQuery(dateRange);
  // TODO: streak — getStreak エンドポイント接続後に有効化

  const isLoading =
    cumulativeTime.isPending ||
    avgFulfillmentQuery.isPending ||
    planRate.isPending ||
    estimationAccuracy.isPending ||
    energyMap.isPending ||
    contextSwitches.isPending ||
    blankRate.isPending;

  // ピーク活用率をエネルギーマップから計算
  const peakUtilization = useMemo(() => {
    if (!energyMap.data || !dateRange.startDate || !dateRange.endDate) return null;
    const defaultPeakZones = [{ startHour: 9, endHour: 14 }];
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    const daysInRange = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return calculatePeakUtilization(energyMap.data, defaultPeakZones, daysInRange);
  }, [energyMap.data, dateRange.startDate, dateRange.endDate]);

  // 見積もり精度の全体平均（分）
  const avgDeviation = useMemo(() => {
    if (!estimationAccuracy.data || estimationAccuracy.data.length === 0) return null;
    const totalDeviation = estimationAccuracy.data.reduce(
      (sum, item) => sum + item.avgDeviationMinutes * item.entryCount,
      0,
    );
    const totalEntries = estimationAccuracy.data.reduce((sum, item) => sum + item.entryCount, 0);
    return totalEntries > 0 ? totalDeviation / totalEntries : 0;
  }, [estimationAccuracy.data]);

  // tRPCクエリ結果を Record<MetricId, MetricData> に正規化
  const metricsMap = useMemo((): Partial<Record<MetricId, MetricData>> => {
    const map: Partial<Record<MetricId, MetricData>> = {};

    if (cumulativeTime.data) {
      // totalMinutes を時間（hours）に変換して duration フォーマットに渡す
      map.totalTime = {
        id: 'totalTime',
        value: cumulativeTime.data.totalMinutes,
        trend: null,
      };
    }

    if (avgFulfillmentQuery.data?.avgFulfillment != null) {
      map.avgFulfillment = {
        id: 'avgFulfillment',
        value: avgFulfillmentQuery.data.avgFulfillment,
        trend: null,
      };
    }

    if (planRate.data) {
      map.planRate = { id: 'planRate', value: planRate.data.planRate, trend: null };
    }

    // TODO: streak — getStreak エンドポイント接続後に有効化
    map.streak = { id: 'streak', value: null, trend: null };

    if (avgDeviation !== null) {
      map.estimationAccuracy = { id: 'estimationAccuracy', value: avgDeviation, trend: null };
    }

    if (peakUtilization) {
      map.peakUtilization = {
        id: 'peakUtilization',
        value: peakUtilization.peakUtilization,
        trend: null,
      };
    }

    if (contextSwitches.data) {
      map.contextSwitches = {
        id: 'contextSwitches',
        value: contextSwitches.data.avgPerDay,
        trend: null,
      };
    }

    if (blankRate.data) {
      map.blankRate = { id: 'blankRate', value: blankRate.data.blankRate, trend: null };
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
