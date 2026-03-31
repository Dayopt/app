'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';

import { formatHours } from '../../utils/formatHours';

/**
 * 年間ヒートマップ（CSS grid 実装、ライブラリ不使用）
 *
 * GitHub 風の 53列×7行グリッド。年ナビゲーション内蔵。
 * getDailyHours は年パラメータが動的なため統合クエリに含められず、個別 useQuery を維持。
 */
export function YearlyHeatmap() {
  const t = useTranslations('calendar.stats.charts');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isPending } = api.entries.getDailyHours.useQuery({ year });

  const totalHours = (data ?? []).reduce((sum, d) => sum + (d.hours ?? 0), 0);

  // 日付 → hours のマップ
  const hoursMap = new Map<string, number>();
  for (const d of data ?? []) {
    // DB関数は 'day' キー、型によっては 'date' キーの場合もある
    const key = (d as { day?: string; date?: string }).day ?? (d as { date?: string }).date ?? '';
    hoursMap.set(key, d.hours);
  }

  // グリッドセル生成: 1/1 から 12/31
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const startDow = jan1.getDay(); // 0=Sun

  // 全セル（パディング含む）
  const cells: Array<{ date: string | null; hours: number }> = [];
  // 先頭パディング（1/1 が日曜でない場合）
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, hours: 0 });
  }
  // 各日
  const d = new Date(jan1);
  while (d <= dec31) {
    const dateStr = d.toISOString().split('T')[0]!;
    cells.push({ date: dateStr, hours: hoursMap.get(dateStr) ?? 0 });
    d.setDate(d.getDate() + 1);
  }

  // 色スケール
  function getColorClass(hours: number, hasDate: boolean): string {
    if (!hasDate) return 'bg-transparent';
    if (hours === 0) return 'bg-muted';
    if (hours < 1) return 'bg-heatmap-scale-1';
    if (hours < 3) return 'bg-heatmap-scale-2';
    if (hours < 5) return 'bg-heatmap-scale-3';
    return 'bg-heatmap-scale-4';
  }

  return (
    <Card className="border-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('yearlyGrid')}</CardTitle>
            <CardDescription>
              {isPending ? '...' : t('yearlyTotal', { hours: formatHours(totalHours) })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="size-8"
              onClick={() => setYear((y) => y - 1)}
              disabled={year <= 2020}
              aria-label="Previous year"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-foreground min-w-12 text-center text-sm font-medium">{year}</span>
            <Button
              variant="ghost"
              size="sm"
              className="size-8"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              aria-label="Next year"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div
              className="grid gap-[2px]"
              style={{
                gridTemplateColumns: 'repeat(53, 1fr)',
                gridTemplateRows: 'repeat(7, 1fr)',
                gridAutoFlow: 'column',
              }}
            >
              {cells.map((cell, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-sm ${getColorClass(cell.hours, cell.date !== null)}`}
                  title={cell.date ? `${cell.date}: ${formatHours(cell.hours)}` : undefined}
                />
              ))}
            </div>
            {/* 凡例 */}
            <div className="mt-2 flex items-center justify-end gap-1 text-xs">
              <span className="text-muted-foreground">{t('yearlyLess')}</span>
              <div className="bg-muted size-3 rounded-sm" />
              <div className="bg-heatmap-scale-1 size-3 rounded-sm" />
              <div className="bg-heatmap-scale-2 size-3 rounded-sm" />
              <div className="bg-heatmap-scale-3 size-3 rounded-sm" />
              <div className="bg-heatmap-scale-4 size-3 rounded-sm" />
              <span className="text-muted-foreground">{t('yearlyMore')}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
