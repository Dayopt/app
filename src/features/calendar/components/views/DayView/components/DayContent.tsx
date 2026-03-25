'use client';

import React, { useCallback } from 'react';

import { ChronotypeBackground } from '@/features/chronotype';
import { isNewEntry, useEntryInspectorStore } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { cn } from '@/lib/utils';

import { EntryCard } from '@/features/entry';
import { useInteraction } from '../../../../interaction';
import { GhostRenderer } from '../../../../interaction/GhostRenderer';
import { CalendarDragSelection } from '../../shared';
import { InlineTagPalette } from '../../shared/components/InlineTagPalette';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import type { CalendarEvent } from '../../shared/types/base.types';
import { getAdjustedStyle, getPreviewTime } from '../../shared/utils/interactionHelpers';
import type { DayContentProps } from '../DayView.types';

// ========================================
// Component
// ========================================

/** DayView のグリッド・エントリ・インタラクションを含むメインコンテンツコンポーネント */
export const DayContent = ({
  date,
  events,
  eventStyles,
  onEntryClick,
  onEntryContextMenu,
  onEventUpdate,
  onTimeRangeSelect,
  disabledEntryId,
  className,
}: DayContentProps) => {
  const inspectorEntryId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);
  const setAnchorRect = useEntryInspectorStore((state) => state.setAnchorRect);
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

  // 統合インタラクション（drag/resize/click）
  const { state, handlers } = useInteraction({
    date,
    events: events ?? [],
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
      const entry = events?.find((e) => e.id === entryId);
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
    [events, getTagById, isMobile],
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
      className={cn('bg-background relative flex-1 overflow-hidden', className)}
      data-calendar-grid
      data-calendar-day-index="0"
      data-tour-target="grid-drag"
    >
      {/* CalendarDragSelection: グリッド選択 + dnd-kit droppable */}
      <CalendarDragSelection
        date={date}
        dayIndex={0}
        className="absolute inset-0"
        onTimeRangeSelect={onTimeRangeSelect}
        disabled={isActive}
        plans={events}
      >
        <div className="absolute inset-0" style={{ height: gridHeight }}>
          <ChronotypeBackground startHour={0} endHour={24} hourHeight={HOUR_HEIGHT} />
          {timeGrid}
        </div>
      </CalendarDragSelection>

      {/* エントリ表示エリア */}
      <div className="pointer-events-none absolute inset-0 z-20" style={{ height: gridHeight }}>
        {events?.map((entry) => {
          const style = eventStyles?.[entry.id];
          if (!style) return null;

          const entryDragging = isDragging && (state as { entryId: string }).entryId === entry.id;
          const entryResizing = isResizing && (state as { entryId: string }).entryId === entry.id;
          const currentTop = parseFloat(style.top?.toString() || '0');
          const currentHeight = parseFloat(style.height?.toString() || '20');

          const adjustedStyle = getAdjustedStyle(style, entry.id, state);

          return (
            <div
              key={entry.id}
              style={adjustedStyle}
              className="pointer-events-none absolute"
              data-entry-wrapper="true"
            >
              <div
                className="pointer-events-auto absolute inset-0 rounded"
                data-entry-block="true"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    handlers.handlePointerDown(entry.id, e, {
                      top: currentTop,
                      left: 0,
                      width: 100,
                      height: currentHeight,
                    });
                  }
                }}
                onTouchStart={(e) => {
                  handlers.handleTouchStart(entry.id, e, {
                    top: currentTop,
                    left: 0,
                    width: 100,
                    height: currentHeight,
                  });
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

        <InlineTagPalette hourHeight={HOUR_HEIGHT} />
      </div>

      {/* React Portal ゴースト（DOM clone廃止） */}
      <GhostRenderer state={state} renderGhost={renderGhost} />
    </div>
  );
};
