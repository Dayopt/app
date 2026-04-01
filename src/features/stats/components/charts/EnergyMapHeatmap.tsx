'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useMemo, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { EnergyMapRow } from '../../types/metrics.types';

/** 表示モード: 記録量 or 充実度 */
type HeatmapMode = 'minutes' | 'fulfillment';

/** 曜日ラベル（月曜始まり: 1=Mon ... 0=Sun） */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DOW_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** 表示する時間帯（6時-23時） */
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => i + HOUR_START);

/** セルの色クラスを決定（5段階） */
function getMinutesColorClass(minutes: number): string {
  if (minutes === 0) return 'bg-muted';
  if (minutes < 15) return 'bg-heatmap-scale-1';
  if (minutes < 30) return 'bg-heatmap-scale-2';
  if (minutes < 45) return 'bg-heatmap-scale-3';
  return 'bg-heatmap-scale-4';
}

/** 充実度の色クラス（3段階スコア → 緑/黄/赤系） */
function getFulfillmentColorClass(score: number | null, hasData: boolean): string {
  if (!hasData || score === null) return 'bg-muted';
  if (score >= 2.5) return 'bg-fulfillment-high';
  if (score >= 1.5) return 'bg-fulfillment-mid';
  return 'bg-fulfillment-low';
}

/** hour×dow のルックアップマップを構築 */
function buildLookup(data: EnergyMapRow[]): Map<string, EnergyMapRow> {
  const map = new Map<string, EnergyMapRow>();
  for (const row of data) {
    map.set(`${row.hour}-${row.dow}`, row);
  }
  return map;
}

interface EnergyMapHeatmapProps {
  data: EnergyMapRow[];
}

/** 時間帯×曜日のエネルギーマップをヒートマップで表示（記録量 / 充実度の2モード対応） */
export function EnergyMapHeatmap({ data }: EnergyMapHeatmapProps) {
  const t = useTranslations('calendar.stats');
  const [mode, setMode] = useState<HeatmapMode>('minutes');
  const isPending = false;

  const lookup = useMemo(() => buildLookup(data), [data]);

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle>{t('energyMap')}</CardTitle>
          <CardDescription>{t('energyMapDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            {t('metrics.noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>{t('energyMap')}</CardTitle>
          <CardDescription>{t('energyMapDesc')}</CardDescription>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('minutes')}
            className={cn(
              'rounded-lg px-2 py-1 text-xs font-medium transition-colors',
              mode === 'minutes'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-state-hover',
            )}
          >
            {t('energyMapMinutes')}
          </button>
          <button
            type="button"
            onClick={() => setMode('fulfillment')}
            className={cn(
              'rounded-lg px-2 py-1 text-xs font-medium transition-colors',
              mode === 'fulfillment'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-state-hover',
            )}
          >
            {t('energyMapFulfillment')}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Header row: day of week labels */}
          {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- complex grid template */}
          <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-1">
            <div />
            {DOW_ORDER.map((_, i) => (
              <div
                key={DOW_KEYS[i]}
                className="text-muted-foreground text-center text-xs font-medium"
              >
                {t(`dow.${DOW_KEYS[i]}`)}
              </div>
            ))}

            {/* Data rows: one per hour */}
            {HOURS.map((hour) => (
              <Fragment key={hour}>
                <div className="text-muted-foreground flex items-center justify-end pr-2 text-xs">
                  {hour}:00
                </div>
                {DOW_ORDER.map((dow, di) => {
                  const row = lookup.get(`${hour}-${dow}`);
                  const colorClass =
                    mode === 'minutes'
                      ? getMinutesColorClass(row?.totalMinutes ?? 0)
                      : getFulfillmentColorClass(
                          row?.avgFulfillment ?? null,
                          (row?.entryCount ?? 0) > 0,
                        );

                  return (
                    <div
                      key={`${hour}-${DOW_KEYS[di]}`}
                      className={cn(
                        'aspect-square rounded-lg transition-colors',
                        colorClass,
                        (row?.entryCount ?? 0) <= 1 && row && 'opacity-60',
                      )}
                      title={
                        row
                          ? `${DOW_KEYS[di]} ${hour}:00 — ${Math.round(row.totalMinutes)}m${
                              row.avgFulfillment != null
                                ? ` (${t('energyMapScore')}: ${row.avgFulfillment.toFixed(1)})`
                                : ''
                            }`
                          : undefined
                      }
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="text-muted-foreground mt-4 flex items-center justify-end gap-2 text-xs">
          {mode === 'minutes' ? (
            <>
              <span>{t('energyMapLess')}</span>
              <div className="flex gap-1">
                <div className="bg-muted size-3.5 rounded-lg" />
                <div className="bg-heatmap-scale-1 size-3.5 rounded-lg" />
                <div className="bg-heatmap-scale-2 size-3.5 rounded-lg" />
                <div className="bg-heatmap-scale-3 size-3.5 rounded-lg" />
                <div className="bg-heatmap-scale-4 size-3.5 rounded-lg" />
              </div>
              <span>{t('energyMapMore')}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <div className="bg-fulfillment-low size-3.5 rounded-lg" />
                <span>1</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="bg-fulfillment-mid size-3.5 rounded-lg" />
                <span>2</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="bg-fulfillment-high size-3.5 rounded-lg" />
                <span>3</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
