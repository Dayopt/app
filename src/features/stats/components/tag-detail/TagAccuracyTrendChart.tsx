'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Line, LineChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  deviation: {
    label: 'Deviation',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

function granularityToBucket(g: StatsGranularity): 'week' | 'month' | 'day' {
  switch (g) {
    case 'day':
      return 'day';
    case 'year':
      return 'month';
    default:
      return 'week';
  }
}

interface TagAccuracyTrendChartProps {
  tagId: string;
}

/**
 * タグ別見積もり精度の推移
 *
 * 折れ線チャートで週/月単位の平均誤差を表示。
 */
export function TagAccuracyTrendChart({ tagId }: TagAccuracyTrendChartProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const bucket = granularityToBucket(granularity);

  const { data, isPending } = api.entries.getTagAccuracyTrend.useQuery({
    tagId,
    bucket,
    ...dateRange,
  });

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('accuracyTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length < 2) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('accuracyTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {t('noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    bucket: d.bucket,
    deviation: Math.round(d.avgDeviation),
  }));

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle className="text-sm">{t('accuracyTrend')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <LineChart accessibilityLayer data={chartData} margin={{ left: 0, right: 16 }}>
            <XAxis dataKey="bucket" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) => `±${value}${t('deviation')}`}
                  hideLabel
                />
              }
            />
            <Line
              dataKey="deviation"
              type="monotone"
              stroke="var(--color-deviation)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--color-deviation)' }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
