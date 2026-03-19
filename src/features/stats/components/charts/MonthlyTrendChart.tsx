'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Area, AreaChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeMonthCount } from '../../utils/computeDateRange';
import { formatHours } from '../../utils/formatHours';

const chartConfig = {
  hours: {
    label: 'Hours',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

export function MonthlyTrendChart() {
  const t = useTranslations('calendar.stats.charts');
  const granularity = useStatsFilterStore((s) => s.granularity);
  const months = useMemo(() => computeMonthCount(granularity), [granularity]);
  const queryInput = months ? { months } : undefined;
  const { data, isPending } = api.entries.getMonthlyTrend.useQuery(queryInput);

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle>{t('monthlyTrend')}</CardTitle>
          <CardDescription>{t('monthlyTrendDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle>{t('monthlyTrend')}</CardTitle>
          <CardDescription>{t('monthlyTrendDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {t('noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalHours = data.reduce((sum, item) => sum + item.hours, 0);
  const avgHours = totalHours / data.length;
  const lastMonth = data[data.length - 1];
  const prevMonth = data[data.length - 2];

  let trendText = '';
  if (lastMonth && prevMonth && prevMonth.hours > 0) {
    const change = ((lastMonth.hours - prevMonth.hours) / prevMonth.hours) * 100;
    trendText = change >= 0 ? `+${change.toFixed(0)}%` : `${change.toFixed(0)}%`;
  }

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>{t('monthlyTrend')}</CardTitle>
        <CardDescription>
          {t('monthlyAvg', { avg: formatHours(avgHours) })}{' '}
          {trendText && t('monthlyMoM', { change: trendText })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{ left: 0, right: 16, top: 10, bottom: 0 }}
          >
            <XAxis
              dataKey="label"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value: string) => value}
            />
            <YAxis hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => formatHours(Number(value))}
                  labelFormatter={(label) => `${label}`}
                />
              }
            />
            <defs>
              <linearGradient id="fillHours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-hours)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-hours)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <Area
              dataKey="hours"
              type="monotone"
              fill="url(#fillHours)"
              stroke="var(--color-hours)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>

        <div className="text-muted-foreground mt-2 text-center text-xs">
          {t('annualTotal', { total: formatHours(totalHours) })}
        </div>
      </CardContent>
    </Card>
  );
}
