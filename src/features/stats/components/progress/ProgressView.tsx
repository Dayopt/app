'use client';

import { TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import type { StatsViewProps } from '../../types/stats.types';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { DayOfWeekChart } from '../charts/DayOfWeekChart';
import { EnergyMapHeatmap } from '../charts/EnergyMapHeatmap';
import { HourlyDistributionChart } from '../charts/HourlyDistributionChart';
import { MonthlyTrendChart } from '../charts/MonthlyTrendChart';
import { YearlyHeatmap } from '../charts/YearlyHeatmap';

/**
 * ProgressView - 進捗ビュー（Progress タブ）
 *
 * 累積・長期トレンド。ヒートマップ + 月次トレンド + 時間帯分布 + 曜日別。
 */
export function ProgressView({ className }: StatsViewProps) {
  const t = useTranslations('calendar.stats');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  // TanStack Query キャッシュ共有: StatsView と同じクエリのため追加リクエストは発生しない
  const timeByTag = api.entries.getTimeByTag.useQuery(dateRange);
  const isAllLoaded = !timeByTag.isPending;
  const isFetching = timeByTag.isFetching;
  const hasError = timeByTag.isError;
  const hasNoData =
    isAllLoaded && !isFetching && !hasError && (!timeByTag.data || timeByTag.data.length === 0);

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
            <MonthlyTrendChart />
            <DayOfWeekChart />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HourlyDistributionChart />
            <EnergyMapHeatmap />
          </div>
        </div>
      </div>
    </div>
  );
}
