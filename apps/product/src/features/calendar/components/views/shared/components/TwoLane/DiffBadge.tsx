/**
 * Log レーンの差分バッジ（実績 - 予定、分）。
 *
 * copywriting「判定せず数字で示す」に従い、±0 は非表示（何も描画しない）。
 * 視覚言語は `features/review/components/diff/ReviewDiffPanel.tsx` の
 * DiffBadge（bg-container + 方向アイコン + success/destructive）を踏襲するが、
 * feature DAG（calendar は review を import できない）のため独立実装する。
 */
'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';

import { formatDiffMinutes } from '@/features/entry';
import { cn } from '@dayopt/components';

export interface DiffBadgeProps {
  /** 実績 - 予定（分）。0 の場合は何も描画しない。 */
  diffMinutes: number;
  className?: string | undefined;
}

export function DiffBadge({ diffMinutes, className }: DiffBadgeProps) {
  if (diffMinutes === 0) return null;

  const isOver = diffMinutes > 0;
  const Icon = isOver ? ArrowUp : ArrowDown;
  const label = `${isOver ? '+' : '-'}${formatDiffMinutes(diffMinutes)}`;

  return (
    <span
      data-log-diff-badge
      className={cn(
        'bg-container border-border-subtle inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs tabular-nums',
        isOver ? 'text-success' : 'text-destructive',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
