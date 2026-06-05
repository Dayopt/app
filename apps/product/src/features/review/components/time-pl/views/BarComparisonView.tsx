'use client';

import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

import {
  formatMinutesDuration,
  formatVariance,
  getVarianceColor,
} from '../data/timePL.presentation';

import type { BarComparisonRow } from '@/features/review/domain/timePL/types';

interface BarComparisonViewProps {
  rows: BarComparisonRow[];
}

/** 横棒 予実比較 — タグごとに Budget vs Actual を横棒で比較 */
export function BarComparisonView({ rows }: BarComparisonViewProps) {
  const maxMinutes = Math.max(...rows.map((r) => Math.max(r.budgetMinutes, r.actualMinutes)), 1);

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <ComparisonRow key={row.tagId} row={row} maxMinutes={maxMinutes} />
      ))}
      <div className="mt-2 flex justify-center gap-4">
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <span className="bg-primary/30 inline-block h-2 w-4 rounded-lg" />
          予算
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <span className="bg-primary inline-block h-2 w-4 rounded-lg" />
          実績
        </span>
      </div>
    </div>
  );
}

function ComparisonRow({ row, maxMinutes }: { row: BarComparisonRow; maxMinutes: number }) {
  const budgetPct = (row.budgetMinutes / maxMinutes) * 100;
  const actualPct = (row.actualMinutes / maxMinutes) * 100;
  const varianceColor = getVarianceColor(row.variancePercent);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <TagIcon icon={row.tagIcon ?? null} color={row.tagColor} size="sm" />
          <span className="text-foreground truncate">{row.tagName}</span>
        </span>
        <span className={cn('font-mono text-xs tabular-nums', varianceColor)}>
          {row.variancePercent !== null ? formatVariance(row.varianceMinutes) : 'new'}
        </span>
      </div>
      <Bar pct={budgetPct} minutes={row.budgetMinutes} variant="budget" />
      <Bar pct={actualPct} minutes={row.actualMinutes} variant="actual" />
    </div>
  );
}

function Bar({
  pct,
  minutes,
  variant,
}: {
  pct: number;
  minutes: number;
  variant: 'budget' | 'actual';
}) {
  return (
    <div className="mb-0.5 flex items-center gap-2">
      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            variant === 'budget' ? 'bg-primary/30' : 'bg-primary',
          )}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span
        className={cn(
          'w-14 text-right font-mono text-xs tabular-nums',
          variant === 'budget' ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {formatMinutesDuration(minutes)}
      </span>
    </div>
  );
}
