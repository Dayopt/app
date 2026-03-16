'use client';

import React, { useCallback } from 'react';

import { ChronotypeBackground } from '@/features/chronotype';
import { useEntryInspectorStore } from '@/features/entry';
import { cn } from '@/lib/utils';

import { EntryCard } from '@/features/entry';
import { useInteraction } from '../../../../interaction';
import { GhostRenderer } from '../../../../interaction/GhostRenderer';
import { CalendarDragSelection } from '../../shared';
import { InlineTagPalette } from '../../shared/components/InlineTagPalette';
import { PanelDragPreview } from '../../shared/components/PanelDragPreview';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import type { CalendarEvent } from '../../shared/types/base.types';
import { getAdjustedStyle, getPreviewTime } from '../../shared/utils/interactionHelpers';
import type { DayContentProps } from '../DayView.types';

// ========================================
// Component
// ========================================

export const DayContent = ({
  date,
  events,
  eventStyles,
  onPlanClick,
  onPlanContextMenu,
  onEventUpdate,
  onTimeRangeSelect,
  disabledPlanId,
  className,
}: DayContentProps) => {
  const inspectorPlanId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

  // 統合インタラクション（drag/resize/click）
  const { state, handlers } = useInteraction({
    date,
    events: events ?? [],
    hourHeight: HOUR_HEIGHT,
    ...(onEventUpdate ? { onEventUpdate } : {}),
    ...(onPlanClick ? { onEventClick: onPlanClick } : {}),
    ...(disabledPlanId != null ? { disabledPlanId } : {}),
  });

  const isActive = state.mode !== 'idle';
  const isDragging = state.mode === 'dragging';
  const isResizing = state.mode === 'resizing';

  // プラン右クリックハンドラー
  const handlePlanContextMenu = useCallback(
    (plan: CalendarEvent, mouseEvent: React.MouseEvent) => {
      if (isDragging || isResizing) return;
      onPlanContextMenu?.(plan, mouseEvent);
    },
    [onPlanContextMenu, isDragging, isResizing],
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

      {/* プラン表示エリア */}
      <div className="pointer-events-none absolute inset-0 z-20" style={{ height: gridHeight }}>
        <PanelDragPreview dayIndex={0} />

        {events?.map((plan) => {
          const style = eventStyles?.[plan.id];
          if (!style) return null;

          const planDragging = isDragging && (state as { entryId: string }).entryId === plan.id;
          const planResizing = isResizing && (state as { entryId: string }).entryId === plan.id;
          const currentTop = parseFloat(style.top?.toString() || '0');
          const currentHeight = parseFloat(style.height?.toString() || '20');

          const adjustedStyle = getAdjustedStyle(style, plan.id, state);

          return (
            <div
              key={plan.id}
              style={adjustedStyle}
              className="pointer-events-none absolute"
              data-plan-wrapper="true"
            >
              <div
                className="pointer-events-auto absolute inset-0 rounded"
                data-plan-block="true"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    handlers.handlePointerDown(plan.id, e, {
                      top: currentTop,
                      left: 0,
                      width: 100,
                      height: currentHeight,
                    });
                  }
                }}
                onTouchStart={(e) => {
                  handlers.handleTouchStart(plan.id, e, {
                    top: currentTop,
                    left: 0,
                    width: 100,
                    height: currentHeight,
                  });
                }}
              >
                <EntryCard
                  plan={plan}
                  position={{
                    top: 0,
                    left: 0,
                    width: 100,
                    height:
                      planResizing && state.mode === 'resizing'
                        ? state.snappedHeight
                        : currentHeight,
                  }}
                  onContextMenu={(p: CalendarEvent, e: React.MouseEvent) =>
                    handlePlanContextMenu(p, e)
                  }
                  onResizeStart={(
                    p: CalendarEvent,
                    direction: 'top' | 'bottom',
                    e: React.MouseEvent,
                  ) =>
                    handlers.handleResizeStart(p.id, direction, e, {
                      top: currentTop,
                      left: 0,
                      width: 100,
                      height: currentHeight,
                    })
                  }
                  isDragging={planDragging}
                  isResizing={planResizing}
                  isActive={isInspectorOpen && inspectorPlanId === plan.id}
                  previewTime={getPreviewTime(plan.id, state)}
                  hourHeight={HOUR_HEIGHT}
                  className={`h-full w-full ${planDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                />
              </div>
            </div>
          );
        })}

        <InlineTagPalette hourHeight={HOUR_HEIGHT} />
      </div>

      {/* React Portal ゴースト（DOM clone廃止） */}
      <GhostRenderer state={state} />
    </div>
  );
};
