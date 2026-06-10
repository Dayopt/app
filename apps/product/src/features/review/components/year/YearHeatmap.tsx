'use client';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@/lib/components/ui/skeleton';

/** 強度レベル（記録なし + 4 段階） */
const LEVEL_OPACITY = [0, 0.25, 0.5, 0.75, 1] as const;

function levelFor(hours: number, maxHours: number): number {
  if (hours <= 0 || maxHours <= 0) return 0;
  const ratio = hours / maxHours;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * YearHeatmap — 1年の記録量ヒートマップ（週 × 曜日のグリッド）
 *
 * 「1年分の時間の地図」を記録の濃淡で俯瞰する年次ビューの主役。
 * data は getDailyHours 由来の日別時間（day: 'YYYY-MM-DD'、ユーザー TZ 基準）。
 */
export function YearHeatmap({
  data,
  year,
  isLoading,
}: {
  data: Array<{ day: string; hours: number }> | undefined;
  year: number;
  isLoading: boolean;
}) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  const byDay = new Map((data ?? []).map((d) => [d.day, d.hours]));
  if (byDay.size === 0 || (data ?? []).every((d) => d.hours === 0)) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        {t('metrics.noData')}
      </div>
    );
  }

  const maxHours = Math.max(...(data ?? []).map((d) => d.hours), 0);

  // 1/1 の曜日分だけ先頭に空セルを置き、日曜始まりの週 × 曜日グリッドにする
  const firstDay = new Date(year, 0, 1);
  const leadingBlanks = firstDay.getDay();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;

  const cells: Array<{ day: string; hours: number } | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
  ];
  const cursor = new Date(year, 0, 1);
  for (let i = 0; i < daysInYear; i++) {
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const day = `${year}-${m}-${d}`;
    cells.push({ day, hours: byDay.get(day) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
        {cells.map((cell, i) =>
          cell ? (
            <div
              key={cell.day}
              className="bg-muted size-2 rounded-none"
              style={
                levelFor(cell.hours, maxHours) > 0
                  ? {
                      backgroundColor: 'var(--primary)',
                      opacity: LEVEL_OPACITY[levelFor(cell.hours, maxHours)],
                    }
                  : undefined
              }
              title={`${cell.day}: ${Math.round(cell.hours * 10) / 10}h`}
            />
          ) : (
            <div key={`blank-${i}`} className="size-2" />
          ),
        )}
      </div>
    </div>
  );
}
