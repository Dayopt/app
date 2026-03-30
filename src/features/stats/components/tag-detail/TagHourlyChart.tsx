'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { formatHours } from '../../utils/formatHours';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  minutes: {
    label: 'Minutes',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

interface TagHourlyChartProps {
  tagId: string;
}

/**
 * タグ別の時間帯分布チャート
 *
 * 横棒グラフで各時間帯の利用分数を表示。
 */
export function TagHourlyChart({ tagId }: TagHourlyChartProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const { data, isPending } = api.entries.getTagHourlyDistribution.useQuery({
    tagId,
    ...dateRange,
  });

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('hourlyDistribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  // 0分以上のスロットのみ表示
  const filtered = (data ?? []).filter((d) => d.minutes > 0);

  if (filtered.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('hourlyDistribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {t('noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = filtered.map((d) => ({
    slot: `${d.hour.toString().padStart(2, '0')}:00`,
    minutes: d.minutes,
    hours: d.minutes / 60,
  }));

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle className="text-sm">{t('hourlyDistribution')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 16 }}
          >
            <YAxis
              dataKey="slot"
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
            <Bar dataKey="hours" fill="var(--color-minutes)" radius={5} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
