'use client';

/**
 * 予定 vs 記録の差分表示（プログレスバー + 差分バッジ）
 *
 */

import { cn } from '@/lib/utils';

import { TimeProgressBar } from './TimeProgressBar';

/** 差分（分）を "+15m" / "±0" / "-10m" 形式にフォーマット */
function formatDiffDisplay(diffMinutes: number): string {
  if (diffMinutes === 0) return '±0';
  const abs = Math.abs(diffMinutes);
  const sign = diffMinutes > 0 ? '+' : '-';
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0 && m > 0) return `${sign}${h}h ${m}m`;
  if (h > 0) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

interface TimeDiffBarProps {
  plannedMinutes: number;
  actualMinutes: number;
}

/** 予定時間と記録時間の差分を視覚的に表示するコンポーネント（プログレスバー + 差分バッジ） */
export function TimeDiffBar({ plannedMinutes, actualMinutes }: TimeDiffBarProps) {
  const diffMinutes = actualMinutes - plannedMinutes;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <TimeProgressBar plannedMinutes={plannedMinutes} actualMinutes={actualMinutes} />
      </div>
      <span
        className={cn(
          'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
          diffMinutes > 0
            ? 'bg-warning-tint text-warning'
            : diffMinutes < 0
              ? 'bg-destructive-tint text-destructive'
              : 'bg-success-tint text-success',
        )}
      >
        {formatDiffDisplay(diffMinutes)}
      </span>
    </div>
  );
}
