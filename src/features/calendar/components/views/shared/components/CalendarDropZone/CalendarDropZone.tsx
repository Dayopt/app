'use client';

/**
 * カレンダー列のドロップゾーン
 *
 * 責務: dnd-kit useDroppable の設定 + ドロップ時刻のリアルタイム追跡のみ。
 * 選択UIやイベントハンドラは CalendarDragSelection が担当。
 */

import { useDroppable } from '@dnd-kit/core';
import { useEffect, useMemo, useRef } from 'react';

import { format } from 'date-fns';

import { cn } from '@/lib/utils';

import { formatTimeString, pixelsToTime } from '../../../../../interaction/time-math';
import { useResponsiveHourHeight } from '../../hooks/useResponsiveHourHeight';

/** CalendarDropZone コンポーネントのプロパティ */
interface CalendarDropZoneProps {
  /** この列が表す日付 */
  date: Date;
  /** 日付インデックス（DnDProvider 連携用） */
  dayIndex: number;
  /** 追加CSSクラス */
  className?: string;
  children: React.ReactNode;
  /** 外部から共有する ref（CalendarDragSelection の containerRef 等） */
  containerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

/** カレンダー列のドロップゾーン — useDroppable + ドロップ時刻追跡 */
export function CalendarDropZone({
  date,
  dayIndex,
  className,
  children,
  containerRef: externalRef,
}: CalendarDropZoneProps) {
  const hourHeight = useResponsiveHourHeight();
  const internalRef = useRef<HTMLDivElement | null>(null);

  // ドロップ時刻: ref で同期更新 → dnd-kit の data getter が即座に最新値を返す
  const dropTimeRef = useRef<string | null>(null);

  const droppableId = `calendar-droppable-${format(date, 'yyyy-MM-dd')}`;
  const droppableData = useMemo(
    () => ({
      date,
      get time() {
        return dropTimeRef.current;
      },
      dayIndex,
    }),
    [date, dayIndex],
  );

  const { setNodeRef } = useDroppable({
    id: droppableId,
    data: droppableData,
  });

  // pointermove でドロップ時刻を同期的に更新
  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;

      if (y >= 0 && y <= rect.height) {
        const time = pixelsToTime(y, hourHeight);
        dropTimeRef.current = formatTimeString(time.hour, time.minute);
      } else {
        dropTimeRef.current = null;
      }
    };

    const handlePointerLeave = () => {
      dropTimeRef.current = null;
    };

    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [hourHeight]);

  return (
    <div
      ref={(node) => {
        internalRef.current = node;
        setNodeRef(node);
        if (externalRef) {
          externalRef.current = node;
        }
      }}
      className={cn('relative', className)}
      data-droppable-id={droppableId}
      data-calendar-day-index={dayIndex}
    >
      {children}
    </div>
  );
}
