'use client';

import { useTranslations } from 'next-intl';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { Skeleton } from '@/lib/components/ui/skeleton';

import { formatHours } from '../../lib/format-hours';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  hours: {
    label: 'Hours',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

/**
 * MonthlyDailyChart — 月内の日別記録時間バー
 *
 * 1か月の記録の波を見せる月次ビューのメインチャート。
 * data は月範囲に filter 済みの dailyHours（day: 'YYYY-MM-DD'）を受け取る。
 */
export function MonthlyDailyChart({
  data,
  isLoading,
}: {
  data: Array<{ day: string; hours: number }> | undefined;
  isLoading: boolean;
}) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!data || data.length === 0 || data.every((d) => d.hours === 0)) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        {t('metrics.noData')}
      </div>
    );
  }

  const chartData = data.map((d) => ({
    day: String(Number(d.day.slice(8))),
    hours: d.hours,
  }));

  return (
    <ChartContainer config={chartConfig}>
      <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 16 }}>
        <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} interval={4} />
        <YAxis hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent formatter={(value) => formatHours(Number(value))} hideLabel />
          }
        />
        <Bar dataKey="hours" fill="var(--color-hours)" radius={5} />
      </BarChart>
    </ChartContainer>
  );
}
