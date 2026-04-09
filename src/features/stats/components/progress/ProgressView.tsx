'use client';

import { TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { cn } from '@/lib/utils';

import { useStatsPageData } from '../../hooks/useStatsPageData';
import type { StatsViewProps } from '../../types/stats.types';
import { DayOfWeekChart } from '../charts/DayOfWeekChart';
import { EnergyMapHeatmap } from '../charts/EnergyMapHeatmap';
import { HourlyDistributionChart } from '../charts/HourlyDistributionChart';
import { MonthlyTrendChart } from '../charts/MonthlyTrendChart';
import { YearlyHeatmap } from '../charts/YearlyHeatmap';

/**
 * ProgressView - 進捗ビュー（Progress タブ）
 *
 * 統合クエリ getStatsPageData から全データを取得し、チャートに props で配る。
 * YearlyHeatmap のみ年ナビゲーションがあるため自前 useQuery を維持。
 */
export function ProgressView({ className }: StatsViewProps) {
  const t = useTranslations('calendar.stats');
  const { data: pageData, isPending, isFetching, isError } = useStatsPageData();

  if (isError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('progress.errorTitle')} description={t('progress.errorDescription')} />
      </div>
    );
  }

  const hasNoData =
    !isPending && !isFetching && (!pageData?.timeByTag || pageData.timeByTag.length === 0);

  if (hasNoData) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <EmptyState
          icon={TrendingUp}
          title={t('progress.emptyTitle')}
          description={t('progress.emptyDescription')}
          size="sm"
          centered
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <YearlyHeatmap />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MonthlyTrendChart data={pageData?.monthlyTrend ?? []} />
            <DayOfWeekChart data={pageData?.dow ?? []} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HourlyDistributionChart data={pageData?.hourly ?? []} />
            <EnergyMapHeatmap data={pageData?.energyMap ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
