'use client';

import { useTranslations } from 'next-intl';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/lib/components/ui/card';
import { Skeleton } from '@/lib/components/ui/skeleton';

import { useTagOverviewData } from '../../hooks/useTagDetailData';
import { formatHours } from '../../utils/formatHours';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  minutes: {
    label: 'Minutes',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface TagDowChartProps {
  tagId: string;
  tagName?: string | undefined;
}

/**
 * タグ別の曜日分布チャート
 *
 * 縦棒グラフで各曜日の利用分数を表示。月曜始まり。
 */
export function TagDowChart({ tagId, tagName }: TagDowChartProps) {
  const t = useTranslations('calendar.stats.tagDetail');

  const { data: overview, isPending } = useTagOverviewData(tagId, tagName);
  const data = overview?.dow ?? null;

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('dayOfWeek')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.every((d) => d.minutes === 0)) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('dayOfWeek')}</CardTitle>
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
    day: DOW_LABELS[d.dow] ?? '',
    minutes: d.minutes,
    hours: Math.round((d.minutes / 60) * 10) / 10,
  }));

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle className="text-sm">{t('dayOfWeek')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 16 }}>
            <XAxis dataKey="day" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis hide />
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
