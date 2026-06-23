'use client';

import { useTranslations } from 'next-intl';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { Skeleton } from '@dayopt/components';

import { formatHours } from '../../lib/format-hours';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';

const chartConfig = {
  hours: {
    label: 'Current',
    color: 'var(--primary)',
  },
  prevHours: {
    label: 'Previous',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

/** ゴースト（前期間）バーの不透明度 */
const GHOST_OPACITY = 0.3;

/** weekStartsOn 設定に従って曜日インデックス（0=日〜6=土）を週の並び順に回転させる */
function buildDowOrder(weekStartsOn: 0 | 1 | 6): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
}

function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/** 前期間ゴーストの凡例（prevData がある時だけ表示） */
function GhostLegend() {
  const t = useTranslations('calendar.stats.rhythm');
  return (
    <div className="mt-2 flex justify-center gap-4">
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <span className="bg-primary inline-block h-2 w-4 rounded-lg" />
        {t('currentPeriod')}
      </span>
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <span
          className="bg-primary inline-block h-2 w-4 rounded-lg"
          style={{ opacity: GHOST_OPACITY }}
        />
        {t('previousPeriod')}
      </span>
    </div>
  );
}

interface DowRhythmChartProps {
  data: Array<{ dow: number; totalMinutes: number }> | undefined;
  /** 前期間の曜日分布（ゴースト表示。過去の自分との比較） */
  prevData?: Array<{ dow: number; totalMinutes: number }> | undefined;
  weekdayLabels: string[];
  /** 週開始曜日（0=日, 1=月, 6=土）。省略時は月曜始まり */
  weekStartsOn?: 0 | 1 | 6 | undefined;
  isLoading: boolean;
}

/**
 * 期間全体の曜日分布チャート — どの曜日に時間が集まったか
 *
 * タグ詳細の TagDowChart を期間全体に一般化した presentational 版。
 * prevData を渡すと前期間を薄いバーで重ね、過去の自分と比較できる。
 */
export function DowRhythmChart({
  data,
  prevData,
  weekdayLabels,
  weekStartsOn = 1,
  isLoading,
}: DowRhythmChartProps) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const byDow = new Map((data ?? []).map((d) => [d.dow, d.totalMinutes]));
  if ((data ?? []).every((d) => d.totalMinutes === 0) || byDow.size === 0) {
    return <RhythmEmpty label={t('metrics.noData')} />;
  }

  const byPrevDow = new Map((prevData ?? []).map((d) => [d.dow, d.totalMinutes]));
  const hasGhost = byPrevDow.size > 0;

  const chartData = buildDowOrder(weekStartsOn).map((dow) => ({
    day: weekdayLabels[dow] ?? '',
    hours: toHours(byDow.get(dow) ?? 0),
    prevHours: toHours(byPrevDow.get(dow) ?? 0),
  }));

  return (
    <div>
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
          {hasGhost && (
            <Bar
              dataKey="prevHours"
              fill="var(--color-prevHours)"
              fillOpacity={GHOST_OPACITY}
              radius={5}
            />
          )}
          <Bar dataKey="hours" fill="var(--color-hours)" radius={5} />
        </BarChart>
      </ChartContainer>
      {hasGhost && <GhostLegend />}
    </div>
  );
}

interface HourlyRhythmChartProps {
  data: Array<{ hour: number; totalMinutes: number }> | undefined;
  /** 前期間の時間帯分布（ゴースト表示） */
  prevData?: Array<{ hour: number; totalMinutes: number }> | undefined;
  isLoading: boolean;
}

/**
 * 期間全体の時間帯分布チャート — どの時間帯に時間が集まったか
 *
 * タグ詳細の TagHourlyChart を期間全体に一般化した presentational 版。
 * prevData を渡すと前期間を薄いバーで重ね、過去の自分と比較できる。
 */
export function HourlyRhythmChart({ data, prevData, isLoading }: HourlyRhythmChartProps) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const byHour = new Map((data ?? []).map((d) => [d.hour, d.totalMinutes]));
  const byPrevHour = new Map((prevData ?? []).map((d) => [d.hour, d.totalMinutes]));
  const hasGhost = byPrevHour.size > 0;

  // 現期間か前期間のどちらかに記録がある時間帯だけ表示
  const hours = [...new Set([...byHour.keys(), ...byPrevHour.keys()])]
    .filter((hour) => (byHour.get(hour) ?? 0) > 0 || (byPrevHour.get(hour) ?? 0) > 0)
    .sort((a, b) => a - b);

  if ((byHour.size === 0 || [...byHour.values()].every((m) => m === 0)) && !hasGhost) {
    return <RhythmEmpty label={t('metrics.noData')} />;
  }
  if (hours.length === 0) {
    return <RhythmEmpty label={t('metrics.noData')} />;
  }

  const chartData = hours.map((hour) => ({
    slot: `${hour.toString().padStart(2, '0')}:00`,
    hours: (byHour.get(hour) ?? 0) / 60,
    prevHours: (byPrevHour.get(hour) ?? 0) / 60,
  }));

  return (
    <div>
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
          {hasGhost && (
            <Bar
              dataKey="prevHours"
              fill="var(--color-prevHours)"
              fillOpacity={GHOST_OPACITY}
              radius={5}
            />
          )}
          <Bar dataKey="hours" fill="var(--color-hours)" radius={5} />
        </BarChart>
      </ChartContainer>
      {hasGhost && <GhostLegend />}
    </div>
  );
}

function RhythmEmpty({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
      {label}
    </div>
  );
}
