'use client';

import { useTranslations } from 'next-intl';

import { useReviewMetrics } from '../../hooks/useReviewMetrics';
import type { StatsPageData } from '../../types/metrics.types';
import { MetricCard } from '../metrics/MetricCard';

interface ReviewMetricsGridProps {
  pageData: StatsPageData | undefined;
}

/**
 * ReviewMetricsGrid — KPIメトリクスをグリッド表示
 *
 * 統合データ `StatsPageData` を受け取り、メトリクスカードを描画。
 */
export function ReviewMetricsGrid({ pageData }: ReviewMetricsGridProps) {
  const t = useTranslations('calendar.stats.metrics');
  const { cards, isLoading } = useReviewMetrics(t, pageData);

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
