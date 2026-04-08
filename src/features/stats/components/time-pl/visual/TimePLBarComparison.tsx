'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

import {
  formatMinutesDuration,
  formatVariance,
  getAccuracyColors,
  getVarianceColor,
} from '../timePL.utils';

import type { TimePLData } from '../timePL.types';

interface TimePLBarComparisonProps {
  data: TimePLData | null;
  className?: string;
}

/**
 * 横棒 予実比較 — タグごとに Budget(薄) vs Actual(濃) の横棒を並べる
 *
 * 非会計層にも直感的に伝わるビジュアライゼーション。
 */
export function TimePLBarComparison({ data, className }: TimePLBarComparisonProps) {
  if (!data) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <EmptyState
            icon={FileSpreadsheet}
            title="まっさらな期間です"
            description="予定を追加すると、予実比較が見えてきます"
            size="sm"
            centered
          />
        </CardContent>
      </Card>
    );
  }

  const colors = getAccuracyColors(data.accuracyStatus);

  // タグ別にBudget/Actual/Varianceをマージ
  const tagMap = new Map<string, TagComparisonRow>();

  for (const row of data.budget.rows) {
    tagMap.set(row.tagId, {
      tagId: row.tagId,
      tagName: row.tagName,
      tagColor: row.tagColor,
      tagIcon: row.tagIcon ?? null,
      budgetMinutes: row.minutes,
      actualMinutes: 0,
      varianceMinutes: 0,
      variancePercent: null,
    });
  }

  for (const row of data.actual.rows) {
    const existing = tagMap.get(row.tagId);
    if (existing) {
      existing.actualMinutes = row.minutes;
    } else {
      tagMap.set(row.tagId, {
        tagId: row.tagId,
        tagName: row.tagName,
        tagColor: row.tagColor,
        tagIcon: row.tagIcon ?? null,
        budgetMinutes: 0,
        actualMinutes: row.minutes,
        varianceMinutes: 0,
        variancePercent: null,
      });
    }
  }

  for (const v of data.varianceRows) {
    const existing = tagMap.get(v.tagId);
    if (existing) {
      existing.varianceMinutes = v.varianceMinutes;
      existing.variancePercent = v.variancePercent;
    }
  }

  const rows = [...tagMap.values()].sort(
    (a, b) =>
      Math.max(b.budgetMinutes, b.actualMinutes) - Math.max(a.budgetMinutes, a.actualMinutes),
  );

  const maxMinutes = Math.max(...rows.map((r) => Math.max(r.budgetMinutes, r.actualMinutes)), 1);

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="flex items-start justify-between p-4 pb-0">
        <div>
          <h3 className="text-foreground text-sm font-medium">予実比較</h3>
          <p className="text-muted-foreground text-xs">{data.period.label}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            colors.bg,
            colors.text,
          )}
        >
          {Math.round(data.accuracyRate * 100)}%
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-4 pt-4 pb-4">
        {rows.map((row) => (
          <ComparisonRow key={row.tagId} row={row} maxMinutes={maxMinutes} />
        ))}

        {/* 凡例 */}
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
      </CardContent>
    </Card>
  );
}

// ── Internal ──

interface TagComparisonRow {
  tagId: string;
  tagName: string;
  tagColor: string;
  tagIcon?: string | null;
  budgetMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
  variancePercent: number | null;
}

function ComparisonRow({ row, maxMinutes }: { row: TagComparisonRow; maxMinutes: number }) {
  const budgetPct = (row.budgetMinutes / maxMinutes) * 100;
  const actualPct = (row.actualMinutes / maxMinutes) * 100;
  const varianceColor = getVarianceColor(row.variancePercent);

  return (
    <div>
      {/* Tag label + variance */}
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <TagIcon icon={row.tagIcon ?? null} color={row.tagColor} size="sm" />
          <ColonTagLabel name={row.tagName} className="text-foreground" />
        </span>
        <span className={cn('font-mono text-xs tabular-nums', varianceColor)}>
          {row.variancePercent !== null ? formatVariance(row.varianceMinutes) : 'new'}
        </span>
      </div>

      {/* Budget bar (thin, muted) */}
      <div className="mb-0.5 flex items-center gap-2">
        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-primary/30 h-full rounded-full transition-all"
            style={{ width: `${Math.max(budgetPct, 1)}%` }}
          />
        </div>
        <span className="text-muted-foreground w-14 text-right font-mono text-xs tabular-nums">
          {formatMinutesDuration(row.budgetMinutes)}
        </span>
      </div>

      {/* Actual bar (thick, solid) */}
      <div className="flex items-center gap-2">
        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${Math.max(actualPct, 1)}%` }}
          />
        </div>
        <span className="text-foreground w-14 text-right font-mono text-xs tabular-nums">
          {formatMinutesDuration(row.actualMinutes)}
        </span>
      </div>
    </div>
  );
}
