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
 * MonthlyTrendChart — 月別の記録時間バー（年次ビュー）
 *
 * data は getStatsPageData の monthlyTrend（month: 'YYYY-MM'）を受け取る。
 */
export function MonthlyTrendChart({
  data,
  isLoading,
}: {
  data: Array<{ month: string; hours: number }> | undefined;
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
    month: String(Number(d.month.slice(5))),
    hours: d.hours,
  }));

  return (
    <ChartContainer config={chartConfig}>
      <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 16 }}>
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
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
