'use client';

import { TagIcon } from '@/features/tags';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { cn } from '@/lib/utils';

import { formatMinutesDuration } from '../data/timePL.derivers';

import type { TimePLRow } from '../data/timePL.types';

interface StackedViewProps {
  budgetRows: TimePLRow[];
  budgetTotal: number;
  actualRows: TimePLRow[];
  actualTotal: number;
}

/** 積み上げバー対比 — Budget と Actual の構成比を視覚的に比較 */
export function StackedView({
  budgetRows,
  budgetTotal,
  actualRows,
  actualTotal,
}: StackedViewProps) {
  // 凡例用: 全タグをマージ
  const allTags = new Map<string, { tagName: string; tagColor: string; tagIcon?: string | null }>();
  for (const row of [...budgetRows, ...actualRows]) {
    if (!allTags.has(row.tagId)) {
      allTags.set(row.tagId, {
        tagName: row.tagName,
        tagColor: row.tagColor,
        tagIcon: row.tagIcon ?? null,
      });
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4">
        <StackedBar rows={budgetRows} total={budgetTotal} label="予算" />
        <StackedBar rows={actualRows} total={actualTotal} label="実績" />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {[...allTags.entries()].map(([tagId, tag]) => (
          <span key={tagId} className="inline-flex items-center gap-1 text-xs">
            <TagIcon icon={tag.tagIcon ?? null} color={tag.tagColor} size="sm" />
            <ColonTagLabel name={tag.tagName} className="text-muted-foreground" />
          </span>
        ))}
      </div>
    </div>
  );
}

function StackedBar({ rows, total, label }: { rows: TimePLRow[]; total: number; label: string }) {
  if (total === 0) return null;
  const sorted = [...rows].sort((a, b) => b.minutes - a.minutes);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-foreground text-sm font-medium">{label}</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {formatMinutesDuration(total)}
        </span>
      </div>
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {sorted.map((row) => {
          const pct = (row.minutes / total) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={row.tagId}
              className="h-full transition-all first:rounded-l-lg last:rounded-r-lg"
              style={{ width: `${pct}%`, backgroundColor: `var(--tag-${row.tagColor})` }}
              title={`${row.tagName}: ${formatMinutesDuration(row.minutes)} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="mt-0.5 flex">
        {sorted.map((row) => {
          const pct = (row.minutes / total) * 100;
          if (pct < 8) return null;
          return (
            <div key={row.tagId} className={cn('text-center')} style={{ width: `${pct}%` }}>
              <span className="text-muted-foreground text-xs">{Math.round(pct)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
