'use client';

import React, { useCallback } from 'react';

import {
  EntryCard,
  computeActualTimeDiffOverlay,
  isNewEntry,
  setInspectorAnchorRect,
  useEntryInspectorStore,
} from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { cn } from '@/lib/utils';

import { useInteraction } from '../../../../interaction';
import { GhostRenderer } from '../../../../interaction/GhostRenderer';
import { useCalendarDragStore } from '../../../../stores/useCalendarDragStore';
import type { CalendarEvent } from '../../../../types/calendar.types';
import { useResponsiveHourHeight } from '../hooks/useResponsiveHourHeight';
import { getAdjustedStyle, getPreviewTime } from '../utils/interactionHelpers';
import type { DateTimeSelection } from './CalendarDragSelection';
import { CalendarDragSelection } from './CalendarDragSelection';
import { InlineTagPalette } from './InlineTagPalette';

// ========================================
// Types
// ========================================

/** CalendarGridContent コンポーネントのプロパティ */
export interface CalendarGridContentProps {
  /** この列が担当する日付 */
  date: Date;
  /** 表示するエントリ一覧 */
  entries: CalendarEvent[];
  /** 計算済みのエントリスタイル（position/size） */
  entryStyles: Record<string, React.CSSProperties>;
  /** ビューモード（useInteraction に渡す） */
  viewMode?: 'day' | '3day' | '5day' | 'week';
  /** この列の日付インデックス（DayView=0, Week/MultiDay=列番号） */
  dayIndex: number;
  /** 重複チェック用の全イベント（週/複数日ビュー用） */
  allEventsForOverlapCheck?: CalendarEvent[];
  /** 表示日付リスト（週/複数日ビュー用） */
  displayDates?: Date[];
  /** エントリクリック */
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  /** エントリ右クリック */
  onEntryContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  /** D&D/リサイズ時の更新コールバック */
  onEventUpdate?:
    | ((
        eventId: string,
        updates: { startTime: Date; endTime: Date },
      ) => Promise<void | { skipToast: true }> | void)
    | undefined;
  /** 時間範囲選択 */
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  /** DnDを無効化するエントリID */
  disabledEntryId?: string | null | undefined;
  /** data-tour-target 属性（DayViewのみ） */
  dataTourTarget?: string | undefined;
  className?: string | undefined;
}

// ========================================
// Component
// ========================================

/** カレンダーグリッドの1日分コンテンツ（全ビュー共通） */
export const CalendarGridContent = React.memo(function CalendarGridContent({
  date,
  entries,
  entryStyles,
  viewMode = 'day',
  dayIndex,
  allEventsForOverlapCheck,
  displayDates,
  onEntryClick,
  onEntryContextMenu,
  onEventUpdate,
  onTimeRangeSelect,
  disabledEntryId,
  dataTourTarget,
  className,
}: CalendarGridContentProps) {
  const inspectorEntryId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

  // 日付間ドラッグ（day以外のビューで使用）
  const enableCrossDayDrag = viewMode !== 'day';
  const isGlobalDragging = useCalendarDragStore((s) => s.isDragging);
  const globalDraggedEntry = useCalendarDragStore((s) => s.draggedPlan);
  const globalTargetDateIndex = useCalendarDragStore((s) => s.targetDateIndex);
  const globalOriginalDateIndex = useCalendarDragStore((s) => s.originalDateIndex);

  // 統合インタラクション（drag/resize/click）
  const { state, handlers } = useInteraction({
    date,
    events: entries,
    ...(allEventsForOverlapCheck ? { allEventsForOverlapCheck } : {}),
    ...(displayDates ? { displayDates } : {}),
    viewMode,
    hourHeight: HOUR_HEIGHT,
    ...(onEventUpdate ? { onEventUpdate } : {}),
    ...(onEntryClick ? { onEventClick: onEntryClick } : {}),
    ...(disabledEntryId != null ? { disabledPlanId: disabledEntryId } : {}),
  });

  const isActive = state.mode !== 'idle';
  const isDragging = state.mode === 'dragging';
  const isResizing = state.mode === 'resizing';

  // ドラッグゴースト描画コールバック
  const renderGhost = useCallback(
    ({ entryId, previewTime }: { entryId: string; previewTime: { start: Date; end: Date } }) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return null;
      const tag = entry.tagId ? getTagById(entry.tagId) : null;
      return (
        <EntryCard
          entry={entry}
          tagName={tag?.name ?? null}
          tagColor={tag?.color ?? null}
          isMobile={isMobile}
          position={{ top: 0, left: 0, width: 100, height: 9999 }}
          previewTime={previewTime}
          style={{ position: 'relative', height: '100%' }}
        />
      );
    },
    [entries, getTagById, isMobile],
  );

  // エントリ右クリックハンドラー
  const handleEntryContextMenu = useCallback(
    (entry: CalendarEvent, mouseEvent: React.MouseEvent) => {
      if (isDragging || isResizing) return;
      onEntryContextMenu?.(entry, mouseEvent);
    },
    [onEntryContextMenu, isDragging, isResizing],
  );

  // 時間グリッド
  const timeGrid = React.useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className={`relative ${hour < 23 ? 'border-border border-b' : ''}`}
          style={{ height: HOUR_HEIGHT }}
        />
      )),
    [HOUR_HEIGHT],
  );

  return (
    <div
      className={cn(
        'relative flex-1',
        enableCrossDayDrag && isDragging ? 'overflow-visible' : 'overflow-hidden',
        // WeekContent/MultiDayContent は h-full を持つ
        enableCrossDayDrag && 'h-full',
        className,
      )}
      data-calendar-grid
      data-calendar-day-index={dayIndex}
      {...(dataTourTarget ? { 'data-tour-target': dataTourTarget } : {})}
    >
      {/* CalendarDragSelection: グリッド選択 + dnd-kit droppable */}
      <CalendarDragSelection
        date={date}
        dayIndex={dayIndex}
        className={cn('absolute inset-0', enableCrossDayDrag && 'z-10')}
        onTimeRangeSelect={onTimeRangeSelect}
        disabled={isActive}
        plans={allEventsForOverlapCheck ?? entries}
      >
        <div className="absolute inset-0" style={{ height: gridHeight }}>
          {timeGrid}
        </div>
      </CalendarDragSelection>

      {/* エントリ表示エリア */}
      <div className="pointer-events-none absolute inset-0 z-20" style={{ height: gridHeight }}>
        {entries.map((entry) => {
          const style = entryStyles[entry.id];
          if (!style) return null;

          const entryDragging = isDragging && (state as { entryId: string }).entryId === entry.id;
          const entryResizing = isResizing && (state as { entryId: string }).entryId === entry.id;
          const currentTop = parseFloat(style.top?.toString() || '0');
          const currentHeight = parseFloat(style.height?.toString() || '20');

          const adjustedStyle = getAdjustedStyle(style, entry.id, state);

          // 予定 vs 記録の差分オーバーレイ（multi-column ビューのみ）
          let finalStyle: React.CSSProperties = adjustedStyle;
          let finalHeight: number;

          if (enableCrossDayDrag) {
            const overlay = computeActualTimeDiffOverlay(entry, HOUR_HEIGHT);
            const overlayAdjustedStyle = {
              ...adjustedStyle,
              top: `${parseFloat(adjustedStyle.top?.toString() || '0') - overlay.topShift}px`,
              height: `${parseFloat(adjustedStyle.height?.toString() || '20') + overlay.heightDelta}px`,
            };

            // 日付間移動中のエントリは元のカラムで半透明
            const isMovingToOtherDate =
              isGlobalDragging &&
              globalDraggedEntry?.id === entry.id &&
              globalTargetDateIndex !== globalOriginalDateIndex;

            finalStyle = isMovingToOtherDate
              ? { ...overlayAdjustedStyle, opacity: 0.3 }
              : overlayAdjustedStyle;

            finalHeight =
              entryResizing && state.mode === 'resizing'
                ? state.snappedHeight
                : currentHeight + overlay.heightDelta;
          } else {
            finalHeight =
              entryResizing && state.mode === 'resizing' ? state.snappedHeight : currentHeight;
          }

          return (
            <div
              key={entry.id}
              style={finalStyle}
              className="pointer-events-none absolute"
              data-entry-wrapper="true"
            >
              <div
                className="pointer-events-auto absolute inset-0 rounded"
                data-entry-block="true"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    handlers.handlePointerDown(
                      entry.id,
                      e,
                      {
                        top: currentTop,
                        left: 0,
                        width: 100,
                        height: currentHeight,
                      },
                      enableCrossDayDrag ? dayIndex : undefined,
                    );
                  }
                }}
                onTouchStart={(e) => {
                  handlers.handleTouchStart(
                    entry.id,
                    e,
                    {
                      top: currentTop,
                      left: 0,
                      width: 100,
                      height: currentHeight,
                    },
                    enableCrossDayDrag ? dayIndex : undefined,
                  );
                }}
              >
                <EntryCard
                  entry={entry}
                  tagName={entry.tagId ? (getTagById(entry.tagId)?.name ?? null) : null}
                  tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
                  onAnchorRect={setInspectorAnchorRect}
                  isMobile={isMobile}
                  position={{
                    top: 0,
                    left: 0,
                    width: 100,
                    height: finalHeight,
                  }}
                  onContextMenu={(p: CalendarEvent, e: React.MouseEvent) =>
                    handleEntryContextMenu(p, e)
                  }
                  onResizeStart={(
                    p: CalendarEvent,
                    direction: 'top' | 'bottom',
                    e: React.MouseEvent | React.TouchEvent,
                  ) =>
                    handlers.handleResizeStart(p.id, direction, e, {
                      top: currentTop,
                      left: 0,
                      width: 100,
                      height: currentHeight,
                    })
                  }
                  isDragging={entryDragging}
                  isResizing={entryResizing}
                  isActive={isInspectorOpen && inspectorEntryId === entry.id}
                  previewTime={getPreviewTime(entry.id, state)}
                  hourHeight={HOUR_HEIGHT}
                  {...(enableCrossDayDrag ? { overlayPositionApplied: true } : {})}
                  className={cn(
                    'h-full w-full',
                    entryDragging ? 'cursor-grabbing' : 'cursor-grab',
                    isNewEntry(entry.id) && 'animate-entry-pop',
                  )}
                />
              </div>
            </div>
          );
        })}

        <InlineTagPalette hourHeight={HOUR_HEIGHT} {...(enableCrossDayDrag ? { date } : {})} />
      </div>

      {/* React Portal ゴースト（DOM clone廃止） */}
      <GhostRenderer state={state} renderGhost={renderGhost} />
    </div>
  );
});
