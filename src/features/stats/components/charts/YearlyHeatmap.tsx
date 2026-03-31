'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import CalendarHeatmap from 'react-calendar-heatmap';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api } from '@/platform/trpc';

import { formatHours } from '../../utils/formatHours';

import 'react-calendar-heatmap/dist/styles.css';

type HeatmapValue = {
  date: string;
  hours: number;
};

/** 年間の日別記録をGitHub草風カレンダーヒートマップで表示 */
export function YearlyHeatmap() {
  const t = useTranslations('calendar.stats.charts');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isPending } = api.entries.getDailyHours.useQuery({ year });

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const values: HeatmapValue[] = data ?? [];
  const totalHours = values.reduce((sum, v) => sum + v.hours, 0);

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>{t('yearlyGrid')}</CardTitle>
          <CardDescription>
            {year} - {t('yearlyTotal', { hours: formatHours(totalHours) })}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            icon
            onClick={() => setYear(year - 1)}
            disabled={year <= 2020}
            aria-label="Previous year"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center text-sm font-normal">{year}</span>
          <Button
            variant="ghost"
            icon
            onClick={() => setYear(year + 1)}
            disabled={year >= currentYear}
            aria-label="Next year"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="yearly-heatmap -mx-2 overflow-x-auto px-2 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="min-w-[650px]">
            <CalendarHeatmap
              startDate={startDate}
              endDate={endDate}
              values={values}
              classForValue={(value) => {
                const v = value as HeatmapValue | undefined;
                if (!v || !v.hours || v.hours === 0) {
                  return 'color-empty';
                }
                if (v.hours < 1) return 'color-scale-1';
                if (v.hours < 3) return 'color-scale-2';
                if (v.hours < 5) return 'color-scale-3';
                return 'color-scale-4';
              }}
              titleForValue={(value) => {
                const v = value as HeatmapValue | undefined;
                if (!v || !v.date) return '';
                return `${v.date}: ${formatHours(v.hours || 0)}`;
              }}
              showWeekdayLabels
              gutterSize={2}
            />
          </div>
        </div>

        {/* Legend */}
        <div className="text-muted-foreground mt-4 flex items-center justify-end gap-2 text-xs">
          <span>{t('yearlyLess')}</span>
          <div className="flex gap-1">
            <div className={cn('bg-muted size-3 rounded-lg')} />
            <div className={cn('bg-heatmap-scale-1 size-3 rounded-lg')} />
            <div className={cn('bg-heatmap-scale-2 size-3 rounded-lg')} />
            <div className={cn('bg-heatmap-scale-3 size-3 rounded-lg')} />
            <div className={cn('bg-heatmap-scale-4 size-3 rounded-lg')} />
          </div>
          <span>{t('yearlyMore')}</span>
        </div>
      </CardContent>

      <style jsx global>{`
        .yearly-heatmap .react-calendar-heatmap {
          font-size: 10px;
        }
        .yearly-heatmap .react-calendar-heatmap text {
          fill: var(--color-muted-foreground);
        }
        .yearly-heatmap .react-calendar-heatmap .color-empty {
          fill: var(--color-muted);
        }
        .yearly-heatmap .react-calendar-heatmap .color-scale-1 {
          fill: var(--heatmap-scale-1);
        }
        .yearly-heatmap .react-calendar-heatmap .color-scale-2 {
          fill: var(--heatmap-scale-2);
        }
        .yearly-heatmap .react-calendar-heatmap .color-scale-3 {
          fill: var(--heatmap-scale-3);
        }
        .yearly-heatmap .react-calendar-heatmap .color-scale-4 {
          fill: var(--heatmap-scale-4);
        }
        .yearly-heatmap .react-calendar-heatmap rect:hover {
          stroke: var(--foreground);
          stroke-width: 1px;
        }
      `}</style>
    </Card>
  );
}
