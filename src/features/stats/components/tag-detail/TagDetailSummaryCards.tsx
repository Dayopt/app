'use client';

import { Clock, Crosshair, Smile, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { api } from '@/platform/trpc';

import { formatMetricValueParts } from '../../lib/metrics';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import type { MetricValueParts } from '../../types/metrics.types';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { MetricCard } from '../metrics/MetricCard';

interface TagDetailSummaryCardsProps {
  tagId: string;
}

/**
 * タグ詳細ページのサマリーメトリクス（4カード）
 *
 * 合計時間 / 見積もり精度 / 充実度 / 計画率
 */
export function TagDetailSummaryCards({ tagId }: TagDetailSummaryCardsProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const tagDateRange = useMemo(() => ({ tagId, ...dateRange }), [tagId, dateRange]);

  const cumulativeTime = api.entries.getTagCumulativeTime.useQuery(tagDateRange);
  const avgFulfillment = api.entries.getTagAvgFulfillment.useQuery(tagDateRange);
  const planRate = api.entries.getTagPlanRate.useQuery(tagDateRange);
  const estimationAccuracy = api.entries.getEstimationAccuracy.useQuery(dateRange);

  const isLoading =
    cumulativeTime.isPending ||
    avgFulfillment.isPending ||
    planRate.isPending ||
    estimationAccuracy.isPending;

  // 見積もり精度: 既存の per-tag データから当該タグを抽出
  const tagAccuracy = useMemo(() => {
    if (!estimationAccuracy.data) return null;
    return estimationAccuracy.data.find((row) => row.tagId === tagId) ?? null;
  }, [estimationAccuracy.data, tagId]);

  const timeValue: MetricValueParts = formatMetricValueParts(
    cumulativeTime.data?.totalMinutes ?? 0,
    'duration',
  );

  const accuracyMinutes = tagAccuracy?.avgDeviationMinutes ?? 0;
  const accuracyValue: MetricValueParts = formatMetricValueParts(accuracyMinutes, 'minutes');

  const fulfillmentValue: MetricValueParts = {
    primary: avgFulfillment.data?.avgFulfillment?.toFixed(1) ?? '-',
    unit: '',
  };

  const planRateValue: MetricValueParts = formatMetricValueParts(
    (planRate.data?.planRate ?? 0) * 100,
    'percentage',
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard
        label={t('totalTime')}
        valueParts={timeValue}
        icon={Clock}
        isLoading={isLoading}
      />
      <MetricCard
        label={t('estimationAccuracy')}
        valueParts={accuracyValue}
        icon={Crosshair}
        isLoading={isLoading}
      />
      <MetricCard
        label={t('avgFulfillment')}
        valueParts={fulfillmentValue}
        icon={Smile}
        isLoading={isLoading}
      />
      <MetricCard
        label={t('planningRate')}
        valueParts={planRateValue}
        icon={Target}
        progress={planRate.data?.planRate}
        progressStatus={
          (planRate.data?.planRate ?? 0) >= 0.7
            ? 'good'
            : (planRate.data?.planRate ?? 0) >= 0.4
              ? 'warning'
              : 'critical'
        }
        isLoading={isLoading}
      />
    </div>
  );
}
