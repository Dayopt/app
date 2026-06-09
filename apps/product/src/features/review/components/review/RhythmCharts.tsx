'use client';

import { useTranslations } from 'next-intl';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { Skeleton } from '@/lib/components/ui/skeleton';

import { formatHours } from '../../lib/format-hours';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  minutes: {
    label: 'Minutes',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

/** 月曜始まりの曜日インデックス順（タグ詳細の TagDowChart と同じ並び） */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

interface DowRhythmChartProps {
  data: Array<{ dow: number; totalMinutes: number }> | undefined;
  weekdayLabels: string[];
  isLoading: boolean;
}

/**
 * 期間全体の曜日分布チャート — どの曜日に時間が集まったか
 *
 * タグ詳細の TagDowChart を期間全体に一般化した presentational 版。
 * データ取得は親（getStatsPageData の dow）が担う。
 */
export function DowRhythmChart({ data, weekdayLabels, isLoading }: DowRhythmChartProps) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const byDow = new Map((data ?? []).map((d) => [d.dow, d.totalMinutes]));
  if ((data ?? []).every((d) => d.totalMinutes === 0) || byDow.size === 0) {
    return <RhythmEmpty label={t('metrics.noData')} />;
  }

  const chartData = DOW_ORDER.map((dow) => {
    const minutes = byDow.get(dow) ?? 0;
    return {
      day: weekdayLabels[dow] ?? '',
      minutes,
      hours: Math.round((minutes / 60) * 10) / 10,
    };
  });

  return (
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
  );
}

interface HourlyRhythmChartProps {
  data: Array<{ hour: number; totalMinutes: number }> | undefined;
  isLoading: boolean;
}

/**
 * 期間全体の時間帯分布チャート — どの時間帯に時間が集まったか
 *
 * タグ詳細の TagHourlyChart を期間全体に一般化した presentational 版。
 * データ取得は親（getStatsPageData の hourly）が担う。
 */
export function HourlyRhythmChart({ data, isLoading }: HourlyRhythmChartProps) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const filtered = (data ?? []).filter((d) => d.totalMinutes > 0);
  if (filtered.length === 0) {
    return <RhythmEmpty label={t('metrics.noData')} />;
  }

  const chartData = filtered.map((d) => ({
    slot: `${d.hour.toString().padStart(2, '0')}:00`,
    minutes: d.totalMinutes,
    hours: d.totalMinutes / 60,
  }));

  return (
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
  );
}

function RhythmEmpty({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
      {label}
    </div>
  );
}
