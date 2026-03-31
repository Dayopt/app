'use client';

import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { formatHours } from '../../utils/formatHours';

interface HourlyDistributionChartProps {
  data: Array<{ hour: number; totalMinutes: number }>;
}

/**
 * 時間帯別の記録時間を横棒グラフで表示（CSS実装、ライブラリ不使用）
 */
export function HourlyDistributionChart({ data }: HourlyDistributionChartProps) {
  const t = useTranslations('calendar.stats.charts');

  // 2時間スロットに集約
  const slots: { label: string; hours: number }[] = [];
  for (let i = 0; i < 24; i += 2) {
    const a = data.find((d) => d.hour === i)?.totalMinutes ?? 0;
    const b = data.find((d) => d.hour === i + 1)?.totalMinutes ?? 0;
    const hours = (a + b) / 60;
    if (hours > 0) {
      slots.push({ label: `${i.toString().padStart(2, '0')}:00`, hours });
    }
  }

  if (slots.length === 0) {
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

  const maxHours = Math.max(...slots.map((s) => s.hours));
  const totalHours = slots.reduce((sum, s) => sum + s.hours, 0);
  const peakSlot = slots.reduce((max, s) => (s.hours > max.hours ? s : max), slots[0]!);

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>{t('hourlyDist')}</CardTitle>
        <CardDescription>
          {t('hourlyDeep', { slot: peakSlot.label, hours: formatHours(peakSlot.hours) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          {slots.map((slot) => {
            const pct = maxHours > 0 ? (slot.hours / maxHours) * 100 : 0;
            return (
              <div
                key={slot.label}
                className="flex items-center gap-2"
                title={`${slot.label}: ${formatHours(slot.hours)}`}
              >
                <span className="text-muted-foreground w-11 shrink-0 font-mono text-xs">
                  {slot.label}
                </span>
                <div className="bg-muted h-5 flex-1 overflow-hidden rounded-md">
                  <div
                    className="bg-primary h-full rounded-md transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-10 shrink-0 text-right font-mono text-xs">
                  {formatHours(slot.hours)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground mt-4 text-center text-xs">
          {t('hourlyTotal', { hours: formatHours(totalHours) })}
        </div>
      </CardContent>
    </Card>
  );
}
