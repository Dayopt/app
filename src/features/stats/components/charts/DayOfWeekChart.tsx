'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { formatHours } from '../../utils/formatHours';

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

interface DayOfWeekChartProps {
  data: Array<{ dow: number; totalMinutes: number }>;
}

/**
 * 曜日別の記録時間を縦棒グラフで表示（CSS実装、ライブラリ不使用）
 */
export function DayOfWeekChart({ data }: DayOfWeekChartProps) {
  const t = useTranslations('calendar.stats.charts');

  const dowMap = new Map(data.map((d) => [d.dow, d.totalMinutes]));
  const ordered = MONDAY_FIRST.map((dow) => ({
    day: DOW_LABELS[dow] ?? '',
    hours: (dowMap.get(dow) ?? 0) / 60,
  }));

  const hasData = ordered.some((d) => d.hours > 0);

  if (!hasData) {
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

  const maxHours = Math.max(...ordered.map((d) => d.hours));
  const busiest = ordered.reduce((max, d) => (d.hours > max.hours ? d : max), ordered[0]!);
  const weekdayHours = ordered.slice(0, 5).reduce((sum, d) => sum + d.hours, 0);
  const weekendHours = ordered.slice(5).reduce((sum, d) => sum + d.hours, 0);

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>{t('dayOfWeek')}</CardTitle>
        <CardDescription>
          {t('dayOfWeekBusiest', { day: busiest.day, hours: formatHours(busiest.hours) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-end gap-1">
          {ordered.map((d) => {
            const pct = maxHours > 0 ? (d.hours / maxHours) * 100 : 0;
            return (
              <div
                key={d.day}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${d.day}: ${formatHours(d.hours)}`}
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="bg-primary w-full rounded-t-sm transition-all"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <span className="text-muted-foreground text-xs">{d.day}</span>
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-4 flex justify-center gap-4 text-xs">
          <span>{t('weekdays', { hours: formatHours(weekdayHours) })}</span>
          <span>{t('weekends', { hours: formatHours(weekendHours) })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
