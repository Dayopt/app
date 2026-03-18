'use client';

import { useTranslations } from 'next-intl';

import { useStatsMetrics } from '../../hooks/useStatsMetrics';
import { MetricCard } from '../metrics/MetricCard';

/**
 * StatsMetricsGrid — KPIメトリクスをグリッド表示
 *
 * useStatsMetrics() フックで統合エンドポイントからデータ取得。
 */
export function StatsMetricsGrid() {
  const t = useTranslations('calendar.stats.metrics');
  const { cards, isLoading } = useStatsMetrics(t);

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
