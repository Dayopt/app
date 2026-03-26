'use client';

import type { TagColorName } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface TagSegment {
  tagName: string;
  tagColor: TagColorName;
  minutes: number;
}

interface TagBreakdownBarProps {
  segments: TagSegment[];
  /** 表示モード: bar = 積み上げバー, list = バー + ラベルリスト */
  mode?: 'bar' | 'list';
  className?: string;
}

/**
 * TagBreakdownBar — タグ別時間配分の積み上げバー
 *
 * Review タブで期間内のタグ別時間配分を視覚的に表示。
 * segments が空の場合は何も表示しない。
 */
export function TagBreakdownBar({ segments, mode = 'list', className }: TagBreakdownBarProps) {
  if (segments.length === 0) return null;

  const totalMinutes = segments.reduce((sum, s) => sum + s.minutes, 0);
  if (totalMinutes === 0) return null;

  // 時間降順でソート
  const sorted = [...segments].sort((a, b) => b.minutes - a.minutes);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Stacked Bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {sorted.map((seg) => {
          const pct = (seg.minutes / totalMinutes) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={seg.tagName}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${pct}%`, backgroundColor: `var(--tag-${seg.tagColor})` }}
              title={`${seg.tagName}: ${formatMinutes(seg.minutes)} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      {mode === 'list' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {sorted.map((seg) => {
            const pct = Math.round((seg.minutes / totalMinutes) * 100);
            return (
              <div key={seg.tagName} className="flex items-center gap-1.5 text-xs">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--tag-${seg.tagColor})` }}
                />
                <span className="text-foreground">{seg.tagName}</span>
                <span className="text-muted-foreground">
                  {formatMinutes(seg.minutes)} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(mins)}m`;
}
