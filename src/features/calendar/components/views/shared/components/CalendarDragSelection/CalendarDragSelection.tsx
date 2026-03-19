'use client';

/**
 * カレンダードラッグ選択コンポーネント
 *
 * - 各カレンダー列が担当する日付を明確に持つ
 * - 全ビュー共通のドラッグ選択動作を提供
 * - ドラッグ操作で時間範囲選択、ダブルクリックでプラン作成
 * - 統一されたDateTimeSelectionを出力
 */

import { useDroppable } from '@dnd-kit/core';

import { cn } from '@/lib/utils';
import { useEntryClipboardStore } from '../../../../../stores/useEntryClipboardStore';

import { useResponsiveHourHeight } from '../../hooks/useResponsiveHourHeight';
import { DragSelectionPreview } from './DragSelectionPreview';
import type { CalendarDragSelectionProps } from './types';
import { useDragSelection } from './useDragSelection';

/** カレンダー列のドラッグ選択・ダブルクリックによる時間範囲選択コンポーネント */
export const CalendarDragSelection = ({
  date,
  className,
  onTimeRangeSelect,
  onDoubleClick,
  children,
  disabled = false,
  plans = [],
}: CalendarDragSelectionProps) => {
  const hourHeight = useResponsiveHourHeight();

  const {
    selection,
    showSelectionPreview,
    isOverlapping,
    containerRef,
    handleMouseDown,
    handleDoubleClick,
    handleTouchStart,
    formatTime,
    droppableId,
    droppableData,
  } = useDragSelection({
    date,
    disabled,
    onTimeRangeSelect,
    onDoubleClick,
    plans,
    hourHeight,
  });

  // ドロップ可能エリアとして設定
  const { setNodeRef, isOver: dndIsOver } = useDroppable({
    id: droppableId,
    data: droppableData,
  });

  return (
    <div
      ref={(node) => {
        // 両方のrefを設定（dnd-kit setNodeRef + 独自containerRef）
        // eslint-disable-next-line react-hooks/immutability -- refコールバック内のdual-ref割り当てパターン
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        setNodeRef(node);
      }}
      className={cn('relative', className, dndIsOver && 'bg-primary-state-hover')}
      aria-label="Calendar time grid"
      onMouseDown={(e) => {
        // Googleカレンダー互換: クリックした日付を記憶（Cmd+Vでペーストする日付として使用）
        const target = e.target as HTMLElement;
        if (!target.closest('[data-plan-card]') && !target.closest('[data-plan-block]')) {
          useEntryClipboardStore.getState().setLastClickedPosition({ date });
        }
        handleMouseDown(e);
      }}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {children}

      {/* ドラッグ選択範囲の表示 - 5px以上ドラッグした場合のみ表示 */}
      {showSelectionPreview && selection && (
        <DragSelectionPreview
          selection={selection}
          formatTime={formatTime}
          isOverlapping={isOverlapping}
          hourHeight={hourHeight}
        />
      )}
    </div>
  );
};
