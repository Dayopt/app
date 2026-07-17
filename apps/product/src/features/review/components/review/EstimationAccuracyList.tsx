'use client';

import { useTranslations } from 'next-intl';

import { resolveTagColor, TagIcon } from '@/features/tags';
import { formatDurationMinutes } from '@/lib/date';
import { cn } from '@dayopt/components';

/** 表示する最大タグ数（エントリ数の多い順） */
const MAX_ROWS = 6;

interface EstimationRow {
  tagId: string;
  tagName: string;
  tagColor: string;
  avgPlannedMinutes: number;
  avgActualMinutes: number;
  avgDeviationMinutes: number;
  recordCount: number;
}

/**
 * EstimationAccuracyList — タグ別の見積もり精度リスト
 *
 * どのタグの見積もりがずれやすいかをタグ単位で示す週次ビューのセクション。
 * 平均予定時間 → 平均実績時間 と、ずれ（±分）を 1 行で表示する。
 */
export function EstimationAccuracyList({
  rows,
  isLoading,
}: {
  rows: EstimationRow[] | undefined;
  isLoading: boolean;
}) {
  const t = useTranslations('calendar.stats');

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        {t('metrics.noData')}
      </div>
    );
  }

  const sorted = (rows ?? [])
    .filter((row) => row.recordCount > 0)
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, MAX_ROWS);

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        {t('metrics.noData')}
      </div>
    );
  }

  return (
    <div className="divide-border divide-y">
      {sorted.map((row) => {
        const deviation = Math.round(row.avgDeviationMinutes);
        return (
          <div key={row.tagId} className="flex min-h-11 min-w-0 items-center gap-3 px-2 py-2">
            <TagIcon icon={null} color={resolveTagColor(row.tagColor)} size="sm" />
            <span className="text-foreground min-w-0 flex-1 truncate text-sm">{row.tagName}</span>
            <span className="text-muted-foreground font-mono text-sm tabular-nums">
              {formatDurationMinutes(Math.round(row.avgPlannedMinutes))} →{' '}
              {formatDurationMinutes(Math.round(row.avgActualMinutes))}
            </span>
            <span
              className={cn(
                'w-14 text-right font-mono text-sm tabular-nums',
                deviation > 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {deviation === 0 ? '±0' : deviation > 0 ? `+${deviation}` : `${deviation}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
