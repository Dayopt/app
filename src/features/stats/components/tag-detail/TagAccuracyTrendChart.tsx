'use client';

import { useTranslations } from 'next-intl';

import { Line, LineChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useTagTimelineData } from '../../hooks/useTagDetailData';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  deviation: {
    label: 'Deviation',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

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

  const { data: timeline, isPending } = useTagTimelineData(tagId);
  const data = timeline?.trend ?? null;

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
