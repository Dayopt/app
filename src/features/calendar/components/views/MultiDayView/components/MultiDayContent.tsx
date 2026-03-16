'use client';

import React, { useCallback } from 'react';

import { useEntryInspectorStore } from '@/features/entry';
import { cn } from '@/lib/utils';
import { useCalendarDragStore } from '../../../../stores/useCalendarDragStore';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { EntryCard } from '@/features/entry';
import { useInteraction } from '../../../../interaction';
import { GhostRenderer } from '../../../../interaction/GhostRenderer';
import { CalendarDragSelection, type DateTimeSelection } from '../../shared';
import { InlineTagPalette } from '../../shared/components/InlineTagPalette';
import { PanelDragPreview } from '../../shared/components/PanelDragPreview';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { getAdjustedStyle, getPreviewTime } from '../../shared/utils/interactionHelpers';

interface MultiDayContentProps {
  date: Date;
  plans: CalendarEvent[];
  allEventsForOverlapCheck?: CalendarEvent[] | undefined;
  planStyles: Record<string, React.CSSProperties>;
  onPlanClick?: ((plan: CalendarEvent) => void) | undefined;
  onPlanContextMenu?: ((plan: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onPlanUpdate?: ((planId: string, updates: Partial<CalendarEvent>) => void) | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  className?: string | undefined;
  dayIndex: number;
  displayDates?: Date[] | undefined;
  disabledPlanId?: string | null | undefined;
  viewMode: '3day' | '5day';
}

// ========================================
// Component
// ========================================

export function MultiDayContent({
  date,
  plans,
  allEventsForOverlapCheck,
  planStyles,
  onPlanClick,
  onPlanContextMenu,
  onPlanUpdate,
  onTimeRangeSelect,
  className,
  dayIndex,
  displayDates,
  disabledPlanId,
  viewMode,
}: MultiDayContentProps) {
  const inspectorPlanId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

  const isGlobalDragging = useCalendarDragStore((s) => s.isDragging);
  const globalDraggedPlan = useCalendarDragStore((s) => s.draggedPlan);
  const globalTargetDateIndex = useCalendarDragStore((s) => s.targetDateIndex);
  const globalOriginalDateIndex = useCalendarDragStore((s) => s.originalDateIndex);

  // onPlanUpdate → onEventUpdate 変換
  const handleEventUpdate = useCallback(
    async (planId: string, updates: { startTime: Date; endTime: Date }) => {
      if (!onPlanUpdate) return;
      return await onPlanUpdate(planId, {
        startDate: updates.startTime,
        endDate: updates.endTime,
      });
    },
    [onPlanUpdate],
  );

  // 統合インタラクション
  const { state, handlers } = useInteraction({
    date,
    events: plans,
    ...(allEventsForOverlapCheck ? { allEventsForOverlapCheck } : {}),
    ...(displayDates ? { displayDates } : {}),
    viewMode,
    hourHeight: HOUR_HEIGHT,
    onEventUpdate: handleEventUpdate,
    ...(onPlanClick ? { onEventClick: onPlanClick } : {}),
    ...(disabledPlanId != null ? { disabledPlanId } : {}),
  });

  const isActive = state.mode !== 'idle';
  const isDragging = state.mode === 'dragging';
  const isResizing = state.mode === 'resizing';

  const handlePlanContextMenu = useCallback(
    (plan: CalendarEvent, mouseEvent: React.MouseEvent) => {
      if (isDragging || isResizing) return;
      onPlanContextMenu?.(plan, mouseEvent);
    },
    [onPlanContextMenu, isDragging, isResizing],
  );

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
      className={cn('bg-background relative h-full flex-1 overflow-hidden', className)}
      data-calendar-grid
      data-calendar-day-index={dayIndex}
    >
      <CalendarDragSelection
        date={date}
        className="absolute inset-0"
        onTimeRangeSelect={onTimeRangeSelect}
        disabled={isActive}
        plans={allEventsForOverlapCheck ?? plans}
      >
        <div className="absolute inset-0" style={{ height: gridHeight }}>
          {timeGrid}
        </div>
      </CalendarDragSelection>

      <div className="pointer-events-none absolute inset-0 z-20" style={{ height: gridHeight }}>
        <PanelDragPreview dayIndex={dayIndex} />

        {plans.map((plan) => {
          const style = planStyles[plan.id];
          if (!style) return null;

          const planDragging = isDragging && (state as { entryId: string }).entryId === plan.id;
          const isMovingToOtherDate =
            isGlobalDragging &&
            globalDraggedPlan?.id === plan.id &&
            globalTargetDateIndex !== globalOriginalDateIndex;

          const planResizing = isResizing && (state as { entryId: string }).entryId === plan.id;
          const currentTop = parseFloat(style.top?.toString() || '0');
          const currentHeight = parseFloat(style.height?.toString() || '20');

          const adjustedStyle = getAdjustedStyle(style, plan.id, state);
          const finalStyle = isMovingToOtherDate
            ? { ...adjustedStyle, opacity: 0.3 }
            : adjustedStyle;

          return (
            <div
              key={plan.id}
              style={finalStyle}
              className="pointer-events-none absolute"
              data-plan-block="true"
            >
              <div
                className="pointer-events-auto absolute inset-0 rounded"
                data-plan-block="true"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    handlers.handlePointerDown(
                      plan.id,
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
                    plan.id,
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

        <InlineTagPalette hourHeight={HOUR_HEIGHT} date={date} />
      </div>

      {/* React Portal ゴースト */}
      <GhostRenderer state={state} />
    </div>
  );
}
