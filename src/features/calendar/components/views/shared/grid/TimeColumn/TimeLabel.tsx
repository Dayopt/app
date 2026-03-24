/**
 * 個別の時間ラベルコンポーネント
 */

'use client';

import { memo } from 'react';

/** TimeLabel コンポーネントのプロパティ */
interface TimeLabelProps {
  hour: number;
  label: string;
  position: number;
  hourHeight: number;
  isFirst: boolean;
  isLast: boolean;
}

/** 時間グリッドの個別時間ラベルを表示するコンポーネント */
export const TimeLabel = memo<TimeLabelProps>(function TimeLabel({
  hour,
  label,
  position,
  isFirst,
}) {
  return (
    <div
      className="text-muted-foreground absolute flex h-0 w-full items-center justify-start px-1 text-xs select-none"
      style={{ top: `${position}px` }}
    >
      {/* 0時は表示しない（見た目がすっきりする） */}
      {!(hour === 0 && isFirst) && <span className="bg-background">{label}</span>}
    </div>
  );
});
