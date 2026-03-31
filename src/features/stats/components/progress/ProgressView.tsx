'use client';

import { TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

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

  const hasNoData =
    !isPending &&
    !isFetching &&
    !isError &&
    (!pageData?.timeByTag || pageData.timeByTag.length === 0);

  if (hasNoData) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <TrendingUp className="text-muted-foreground size-10" />
          <div className="text-center">
            <p className="text-foreground text-sm font-medium">{t('emptyTitle')}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t('emptyDescription')}</p>
          </div>
        </div>
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
