'use client';

import { cn } from '@/lib/utils';

import type { StatsViewProps } from '../../types/stats.types';
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
  return (
    <div className={cn('bg-background flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex-1 overflow-y-auto">
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
