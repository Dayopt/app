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

/** 曜日別の記録時間を棒グラフで表示 */
export function DayOfWeekChart() {
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
  const { data, isPending } = api.entries.getDayOfWeekDistribution.useQuery(queryInput);

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle>{t('dayOfWeek')}</CardTitle>
          <CardDescription>{t('dayOfWeekDesc')}</CardDescription>
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
          <CardTitle>{t('dayOfWeek')}</CardTitle>
          <CardDescription>{t('dayOfWeekDesc')}</CardDescription>
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
  const maxDay = firstItem
    ? data.reduce((max, item) => (item.hours > max.hours ? item : max), firstItem)
    : undefined;

  const weekdayHours = data.slice(0, 5).reduce((sum, item) => sum + item.hours, 0);
  const weekendHours = data.slice(5).reduce((sum, item) => sum + item.hours, 0);

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>{t('dayOfWeek')}</CardTitle>
        <CardDescription>
          {t('dayOfWeekBusiest', {
            day: maxDay?.day ?? '',
            hours: formatHours(maxDay?.hours ?? 0),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 16 }}>
            <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} />
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

        <div className="text-muted-foreground mt-2 flex justify-center gap-4 text-xs">
          <span>{t('weekdays', { hours: formatHours(weekdayHours) })}</span>
          <span>{t('weekends', { hours: formatHours(weekendHours) })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
