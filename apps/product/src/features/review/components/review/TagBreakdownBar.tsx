'use client';

import type { TagColorName } from '@/features/tags';
import { TagIcon } from '@/features/tags';
import { formatDurationMinutes } from '@/lib/date';
import { cn } from '@dayopt/components';

interface TagSegment {
  tagId: string;
  tagName: string;
  tagColor: TagColorName;
  tagIcon?: string | null;
  minutes: number;
}

interface TagBreakdownBarProps {
  segments: TagSegment[];
  /** 表示モード: bar = 積み上げバー, list = バー + ラベルリスト */
  mode?: 'bar' | 'list';
  /** タグクリック時のコールバック */
  onTagClick?: (tagId: string) => void;
  className?: string;
}

/**
 * TagBreakdownBar — タグ別時間配分の積み上げバー
 *
 * Review タブで期間内のタグ別時間配分を視覚的に表示。
 * segments が空の場合は何も表示しない。
 */
export function TagBreakdownBar({
  segments,
  mode = 'list',
  onTagClick,
  className,
}: TagBreakdownBarProps) {
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
            <button
              type="button"
              key={seg.tagName}
              className={cn(
                'h-full first:rounded-l-full last:rounded-r-full',
                onTagClick && 'hover:bg-state-hover cursor-pointer transition-colors',
              )}
              style={{ width: `${pct}%`, backgroundColor: `var(--tag-${seg.tagColor})` }}
              title={`${seg.tagName}: ${formatDurationMinutes(seg.minutes)} (${Math.round(pct)}%)`}
              onClick={() => onTagClick?.(seg.tagId)}
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
              <button
                type="button"
                key={seg.tagName}
                className={cn(
                  'flex items-center gap-1 text-xs',
                  onTagClick && 'hover:bg-state-hover cursor-pointer rounded-lg transition-colors',
                )}
                onClick={() => onTagClick?.(seg.tagId)}
              >
                <TagIcon icon={seg.tagIcon ?? null} color={seg.tagColor} size="sm" />
                <span className="text-foreground truncate">{seg.tagName}</span>
                <span className="text-muted-foreground">
                  {formatDurationMinutes(seg.minutes)} ({pct}%)
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
