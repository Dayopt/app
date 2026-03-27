'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { formatHours } from '../../utils/formatHours';

const chartConfig = {
  hours: {
    label: 'Hours',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

/** 時間帯別の記録時間を横棒グラフで表示 */
export function HourlyDistributionChart() {
  const t = useTranslations('calendar.stats.charts');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);
  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );
  const queryInput = dateRange;
  const { data, isPending } = api.entries.getHourlyDistribution.useQuery(queryInput);

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle>{t('hourlyDist')}</CardTitle>
          <CardDescription>{t('hourlyDistDesc')}</CardDescription>
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
          <CardTitle>{t('hourlyDist')}</CardTitle>
          <CardDescription>{t('hourlyDistDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {t('noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const firstItem = data[0];
  const maxSlot = firstItem
    ? data.reduce((max, item) => (item.hours > max.hours ? item : max), firstItem)
    : undefined;
  const totalHours = data.reduce((sum, item) => sum + item.hours, 0);

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>{t('hourlyDist')}</CardTitle>
        <CardDescription>
          {t('hourlyDeep', {
            slot: maxSlot?.timeSlot ?? '',
            hours: formatHours(maxSlot?.hours ?? 0),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 16 }}
          >
            <YAxis
              dataKey="timeSlot"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              width={50}
            />
            <XAxis dataKey="hours" type="number" hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent formatter={(value) => formatHours(Number(value))} hideLabel />
              }
            />
            <Bar dataKey="hours" fill="var(--color-hours)" radius={5} />
          </BarChart>
        </ChartContainer>

        <div className="text-muted-foreground mt-2 text-center text-xs">
          {t('hourlyTotal', { hours: formatHours(totalHours) })}
        </div>
      </CardContent>
    </Card>
  );
}
