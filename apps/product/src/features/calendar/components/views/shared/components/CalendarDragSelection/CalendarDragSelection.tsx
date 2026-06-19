'use client';

/**
 * カレンダードラッグ選択コンポーネント
 *
 * - 全ビュー共通のドラッグ選択動作を提供
 * - ドラッグ操作で時間範囲選択、ダブルクリックでプラン作成
 * - ドロップゾーンは CalendarDropZone に委譲
 */

import { cn } from '@/lib/utils';
import { useDragOverlapResolver } from '../../../../../hooks/operations/useDragOverlapResolver';
import { useEntryClipboardStore } from '../../../../../stores/useEntryClipboardStore';

import { useResponsiveHourHeight } from '../../hooks/useResponsiveHourHeight';
import { CalendarDropZone } from '../CalendarDropZone';
import { DragSelectionPreview } from './DragSelectionPreview';
import type { CalendarDragSelectionProps } from './types';
import { useDragSelection } from './useDragSelection';

/** カレンダー列のドラッグ選択・ダブルクリックによる時間範囲選択コンポーネント */
export const CalendarDragSelection = ({
  date,
  dayIndex,
  className,
  onTimeRangeSelect,
  onDoubleClick,
  children,
  disabled = false,
  plans = [],
}: CalendarDragSelectionProps) => {
  const hourHeight = useResponsiveHourHeight();
  const resolveOverlapDrop = useDragOverlapResolver();

  const {
    selection,
    showSelectionPreview,
    isOverlapping,
    containerRef,
    handleMouseDown,
    handleDoubleClick,
    handleTouchStart,
    formatTime,
  } = useDragSelection({
    date,
    dayIndex,
    disabled,
    onTimeRangeSelect,
    onDoubleClick,
    plans,
    hourHeight,
    onOverlapDrop: resolveOverlapDrop,
  });

  return (
    <CalendarDropZone
      date={date}
      dayIndex={dayIndex ?? 0}
      className={cn(className)}
      containerRef={containerRef as React.MutableRefObject<HTMLDivElement | null>}
    >
      {/* イベントハンドラ層 */}
      <div
        className="absolute inset-0"
        onMouseDown={(e) => {
          // Googleカレンダー互換: クリックした日付を記憶（Cmd+Vでペーストする日付として使用）
          useEntryClipboardStore.getState().setLastClickedPosition({ date });
          handleMouseDown(e);
        }}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {children}
      </div>

      {/* ドラッグ選択範囲の表示 - 5px以上ドラッグした場合のみ表示 */}
      {showSelectionPreview && selection && (
        <DragSelectionPreview
          selection={selection}
          date={date}
          formatTime={formatTime}
          isOverlapping={isOverlapping}
          hourHeight={hourHeight}
        />
      )}
    </CalendarDropZone>
  );
};
