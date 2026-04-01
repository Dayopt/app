'use client';

import { useTranslations } from 'next-intl';

import { useStatsMetrics } from '../../hooks/useStatsMetrics';
import type { StatsPageData } from '../../types/metrics.types';
import { MetricCard } from '../metrics/MetricCard';

interface StatsMetricsGridProps {
  pageData: StatsPageData | undefined;
  dateRange: { startDate: string; endDate: string };
  prevDateRange: { startDate: string; endDate: string };
}

/**
 * StatsMetricsGrid — KPIメトリクスをグリッド表示
 *
 * 統合データ `StatsPageData` を受け取り、メトリクスカードを描画。
 */
export function StatsMetricsGrid({ pageData, dateRange, prevDateRange }: StatsMetricsGridProps) {
  const t = useTranslations('calendar.stats.metrics');
  const { cards, isLoading } = useStatsMetrics(t, pageData, dateRange, prevDateRange);

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.id}
          label={card.label}
          valueParts={card.valueParts}
          icon={card.icon}
          trend={card.trend}
          variant={card.variant}
          progress={card.progress}
          progressStatus={card.progressStatus}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
