'use client';

import React, { useCallback } from 'react';

import { ChronotypeBackground } from '@/features/chronotype';
import { useEntryInspectorStore } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { cn } from '@/lib/utils';
import { useCalendarDragStore } from '../../../../stores/useCalendarDragStore';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { EntryCard } from '@/features/entry';
import { useInteraction } from '../../../../interaction';
import { GhostRenderer } from '../../../../interaction/GhostRenderer';
import { CalendarDragSelection, useEntryStyles } from '../../shared';
import { InlineTagPalette } from '../../shared/components/InlineTagPalette';
import { PanelDragPreview } from '../../shared/components/PanelDragPreview';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { getAdjustedStyle, getPreviewTime } from '../../shared/utils/interactionHelpers';
import type { WeekEntryPosition } from '../WeekView.types';

/** WeekContent コンポーネントのプロパティ */
interface WeekContentProps {
  date: Date;
  entries: CalendarEvent[];
  /** 重複チェック用の全イベント（週全体のイベント） */
  allEventsForOverlapCheck?: CalendarEvent[] | undefined;
  entryPositions: WeekEntryPosition[];
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onEntryUpdate?: ((entryId: string, updates: Partial<CalendarEvent>) => void) | undefined;
  onTimeRangeSelect?: ((selection: import('../../shared').DateTimeSelection) => void) | undefined;
  className?: string | undefined;
  dayIndex: number;
  displayDates?: Date[] | undefined;
  /** DnDを無効化するエントリID（Inspector表示中のエントリなど） */
  disabledEntryId?: string | null | undefined;
}

// ========================================
// Component
// ========================================

/** 週ビューの1日分のグリッド・エントリ・インタラクションを含むコンポーネント */
export const WeekContent = React.memo(function WeekContent({
  date,
  entries,
  allEventsForOverlapCheck,
  entryPositions,
  onEntryClick,
  onEntryContextMenu,
  onEntryUpdate,
  onTimeRangeSelect,
  className,
  dayIndex,
  displayDates,
  disabledEntryId,
}: WeekContentProps) {
  const inspectorEntryId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);
  const setAnchorRect = useEntryInspectorStore((state) => state.setAnchorRect);
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

  // グローバルドラッグ状態（日付間移動用）
  const isGlobalDragging = useCalendarDragStore((s) => s.isDragging);
  const globalDraggedEntry = useCalendarDragStore((s) => s.draggedPlan);
  const globalTargetDateIndex = useCalendarDragStore((s) => s.targetDateIndex);
  const globalOriginalDateIndex = useCalendarDragStore((s) => s.originalDateIndex);

  // onEntryUpdate → onEventUpdate 変換
  const handleEventUpdate = useCallback(
    async (entryId: string, updates: { startTime: Date; endTime: Date }) => {
      if (!onEntryUpdate) return;
      return await onEntryUpdate(entryId, {
        startDate: updates.startTime,
        endDate: updates.endTime,
      });
    },
    [onEntryUpdate],
  );

  // 統合インタラクション
  const { state, handlers } = useInteraction({
    date,
    events: entries,
    ...(allEventsForOverlapCheck ? { allEventsForOverlapCheck } : {}),
    ...(displayDates ? { displayDates } : {}),
    viewMode: 'week',
    hourHeight: HOUR_HEIGHT,
    onEventUpdate: handleEventUpdate,
    ...(onEntryClick ? { onEventClick: onEntryClick } : {}),
    ...(disabledEntryId != null ? { disabledPlanId: disabledEntryId } : {}),
  });

  const isActive = state.mode !== 'idle';
  const isDragging = state.mode === 'dragging';
  const isResizing = state.mode === 'resizing';

  // この日のエントリ位置
  const dayEntryPositions = React.useMemo(() => {
    return entryPositions
      .filter((pos) => pos.dayIndex === dayIndex)
      .map((pos) => ({
        plan: pos.plan,
        top: pos.top,
        height: pos.height,
        left: 2,
        width: 96,
        zIndex: pos.zIndex,
        column: pos.column,
        totalColumns: pos.totalColumns,
        opacity: 1.0,
      }));
  }, [entryPositions, dayIndex]);

  const entryStyles = useEntryStyles(dayEntryPositions);

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
        'bg-background relative h-full flex-1',
        isDragging ? 'overflow-visible' : 'overflow-hidden',
        className,
      )}
      data-calendar-grid
      data-calendar-day-index={dayIndex}
    >
      {/* 左端セパレータ（エントリのアクセントストリップがこの上に乗る） */}
      <div className="bg-border pointer-events-none absolute inset-y-0 left-0 w-px" />

      <CalendarDragSelection
        date={date}
        className="absolute inset-0 z-10"
        onTimeRangeSelect={(selection) => {
          onTimeRangeSelect?.(selection);
        }}
        disabled={isActive}
        plans={allEventsForOverlapCheck ?? entries}
      >
        <div className="absolute inset-0" style={{ height: gridHeight }}>
          <ChronotypeBackground startHour={0} endHour={24} hourHeight={HOUR_HEIGHT} />
          {timeGrid}
        </div>
      </CalendarDragSelection>

      <div className="pointer-events-none absolute inset-0 z-20" style={{ height: gridHeight }}>
        <PanelDragPreview dayIndex={dayIndex} />

        {entries.map((entry) => {
          const style = entryStyles[entry.id];
          if (!style) return null;

          const entryDragging = isDragging && (state as { entryId: string }).entryId === entry.id;

          // 日付間移動中のエントリは元のカラムで半透明
          const isMovingToOtherDate =
            isGlobalDragging &&
            globalDraggedEntry?.id === entry.id &&
            globalTargetDateIndex !== globalOriginalDateIndex;

          const entryResizing = isResizing && (state as { entryId: string }).entryId === entry.id;
          const currentTop = parseFloat(style.top?.toString() || '0');
          const currentHeight = parseFloat(style.height?.toString() || '20');

          const adjustedStyle = getAdjustedStyle(style, entry.id, state);
          const finalStyle = isMovingToOtherDate
            ? { ...adjustedStyle, opacity: 0.3 }
            : adjustedStyle;

          return (
            <div
              key={entry.id}
              style={finalStyle}
              className="pointer-events-none absolute"
              data-entry-block="true"
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
                      dayIndex,
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
                    dayIndex,
                  );
                }}
              >
                <EntryCard
                  entry={entry}
                  tagName={entry.tagId ? (getTagById(entry.tagId)?.name ?? null) : null}
                  tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
                  onAnchorRect={setAnchorRect}
                  isMobile={isMobile}
                  position={{
                    top: 0,
                    left: 0,
                    width: 100,
                    height:
                      entryResizing && state.mode === 'resizing'
                        ? state.snappedHeight
                        : currentHeight,
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
                  className={`h-full w-full ${entryDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                />
              </div>
            </div>
          );
        })}

        <InlineTagPalette hourHeight={HOUR_HEIGHT} date={date} />
      </div>

      {/* React Portal ゴースト */}
      <GhostRenderer state={state} />
    </div>
  );
});
