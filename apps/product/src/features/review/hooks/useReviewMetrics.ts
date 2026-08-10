'use client';

import { useMemo } from 'react';

import type { useTranslations } from 'next-intl';

import { api } from '@/lib/trpc';

import { METRIC_DEFINITIONS, METRIC_ORDER } from '../lib/metricDefinitions';
import {
  computeAvgDeviation,
  formatMetricValueParts,
  getMetricProgress,
  getMetricTrend,
  getThresholdStatus,
} from '../lib/metrics';
import type { MetricData, MetricId, MetricTrend, StatsPageData } from '../types/metrics.types';

// =============================================================================
// Helpers
// =============================================================================

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
  t: ReturnType<typeof useTranslations<'calendar.stats.metrics'>>,
  pageData: StatsPageData | undefined,
): UseStatsMetricsResult {
  const streakQuery = api.statistics.getStreak.useQuery();

  const isLoading = !pageData;

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

    map.planRate = {
      id: 'planRate',
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
  }, [pageData, avgDeviation, prevAvgDeviation, streakQuery.data]);

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
