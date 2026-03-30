'use client';

/**
 * カレンダー列のドロップゾーン
 *
 * 責務: ドラッグ選択の基盤要素 + data-calendar-day-index の付与。
 * dnd-kit の useDroppable は廃止し、カスタム interaction machine に統一。
 */

import { cn } from '@/lib/utils';

/** CalendarDropZone コンポーネントのプロパティ */
interface CalendarDropZoneProps {
  /** この列が表す日付 */
  date: Date;
  /** 日付インデックス（interaction machine 連携用） */
  dayIndex: number;
  /** 追加CSSクラス */
  className?: string;
  children: React.ReactNode;
  /** 外部から共有する ref（CalendarDragSelection の containerRef 等） */
  containerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

/** カレンダー列のドロップゾーン */
export function CalendarDropZone({
  date: _date,
  dayIndex,
  className,
  children,
  containerRef,
}: CalendarDropZoneProps) {
  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      data-calendar-day-index={dayIndex}
    >
      {children}
    </div>
  );
}
