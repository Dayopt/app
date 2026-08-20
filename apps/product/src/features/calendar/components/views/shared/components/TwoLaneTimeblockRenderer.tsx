'use client';

/**
 * TwoLane（Plan/Record レーン）カードのインタラクションラッパー（Step 8 flip）。
 *
 * `TimeblockRenderer` と同じ interaction 契約（useInteraction の handlers/state）を使うが、
 * 描画は kind に応じて `PlanLaneCard` / `RecordLaneCard`（presentational）に委譲する。
 * PlanLaneCard/RecordLaneCard は自身の `position` prop から絶対座標を描画するため、
 * 追加のラッパー div で位置を持たせない（二重にレーン幅が掛かるのを避ける）。
 * past-plan/auto_migrated ロックは TimeblockRenderer には無い、
 * time model 固有の関心事としてここに実装する。
 */

import type React from 'react';

import { useActivitiesMap } from '@/features/activities';
import { resolveTimeblockDestination, useTimeblockInspectorStore } from '@/features/timeblock';
import type { TimeFormat } from '@dayopt/domain';

import type { InteractionState } from '../../../../domain/interaction/types';
import {
  calendarEventToPlanEvent,
  calendarEventToRecordEvent,
} from '../../../../lib/calendar-event-to-lane-event';
import type { TwoLanePosition } from '../../../../lib/two-lane-layout';
import type { CalendarDisplayEvent } from '../../../../types/calendar.types';
import { PlanLaneCard } from './TwoLane/PlanLaneCard';
import { RecordLaneCard } from './TwoLane/RecordLaneCard';

interface TwoLaneEntryRendererProps {
  entry: CalendarDisplayEvent;
  position: TwoLanePosition;
  allEvents: CalendarDisplayEvent[];
  isDragging: boolean;
  isResizing: boolean;
  interactionState: InteractionState;
  dayIndex: number;
  enableCrossDayDrag: boolean;
  showDayDiffMarker?: boolean | undefined;
  compactCards: boolean;
  timeFormat: TimeFormat;
  onEntryClick?: ((entry: CalendarDisplayEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarDisplayEvent, e: React.MouseEvent) => void) | undefined;
  onPointerDown: (
    timeblockId: string,
    e: React.MouseEvent,
    rect: { top: number; left: number; width: number; height: number },
    dayIndex?: number,
  ) => void;
  onTouchStart: (
    timeblockId: string,
    e: React.TouchEvent,
    rect: { top: number; left: number; width: number; height: number },
    dayIndex?: number,
  ) => void;
  onResizeStart: (
    timeblockId: string,
    direction: 'top' | 'bottom',
    e: React.MouseEvent | React.TouchEvent,
    rect: { top: number; left: number; width: number; height: number },
  ) => void;
}

/** auto_migrated record はドラッグ/リサイズを禁止する。 */
function isDragDisabled(entry: CalendarDisplayEvent): boolean {
  if (entry.recordSource === 'auto_migrated') return true;
  return false;
}

/** 過去Planは時間変更を禁止するが、Recordレーンへの記録dropは許可する。 */
function isResizeDisabled(entry: CalendarDisplayEvent, now: number): boolean {
  if (entry.kind === 'plan') {
    const end = entry.endDate?.getTime();
    return end != null && end <= now;
  }
  return entry.recordSource === 'auto_migrated';
}

/** entry.id を絶対座標 rect として渡すためのヘルパー（useInteraction の TimeblockRect 契約） */
function toRect(position: TwoLanePosition) {
  return { top: position.top, left: position.left, width: position.width, height: position.height };
}

export function TwoLaneTimeblockRenderer({
  entry,
  position,
  allEvents,
  isDragging,
  isResizing,
  interactionState,
  dayIndex,
  enableCrossDayDrag,
  showDayDiffMarker = false,
  compactCards,
  timeFormat,
  onEntryClick,
  onEntryContextMenu,
  onPointerDown,
  onTouchStart,
  onResizeStart,
}: TwoLaneEntryRendererProps) {
  const inspectorEntryId = useTimeblockInspectorStore((state) => state.timeblockId);
  const isInspectorOpen = useTimeblockInspectorStore((state) => state.isOpen);
  const { getActivityById } = useActivitiesMap();

  const timeblockDragging =
    isDragging && interactionState.mode === 'dragging' && interactionState.timeblockId === entry.id;
  const timeblockResizing =
    isResizing && interactionState.mode === 'resizing' && interactionState.timeblockId === entry.id;

  // リサイズ中はプレビュー高さを反映する（TimeblockRenderer の buildResizePreviewEntry 相当）
  const previewPosition: TwoLanePosition =
    interactionState.mode === 'resizing' && interactionState.timeblockId === entry.id
      ? { ...position, height: interactionState.snappedHeight }
      : position;

  const styleOverride: React.CSSProperties = timeblockDragging
    ? { opacity: 0.3, zIndex: 1 }
    : timeblockResizing
      ? { zIndex: 1000 }
      : {};

  const activity = entry.activityId ? getActivityById(entry.activityId) : undefined;
  const activityName = activity?.name ?? null;
  const activityColor = activity?.color ?? null;
  const activityIcon = activity?.icon ?? null;
  const activityCategoryId = activity?.categoryId ?? null;
  const isActive = isInspectorOpen && inspectorEntryId === entry.id;
  // eslint-disable-next-line react-hooks/purity -- 過去 plan / auto_migrated ロック判定。再レンダーごとの now で十分（TimeblockContextMenu と同じ運用）
  const now = Date.now();
  const disableDrag = isDragDisabled(entry);
  const disableResize = isResizeDisabled(entry, now);
  const rect = toRect(position);

  const handleClick = (_target: unknown) => {
    onEntryClick?.(entry);
  };

  const handleContextMenu = (_target: unknown, e: React.MouseEvent) => {
    if (timeblockDragging || timeblockResizing) return;
    onEntryContextMenu?.(entry, e);
  };

  const handlePointerDown = (_target: unknown, e: React.MouseEvent) => {
    onPointerDown(entry.id, e, rect, enableCrossDayDrag ? dayIndex : undefined);
  };

  const handleTouchStart = (_target: unknown, e: React.TouchEvent) => {
    onTouchStart(entry.id, e, rect, enableCrossDayDrag ? dayIndex : undefined);
  };

  const handleResizeStart = (_target: unknown, e: React.MouseEvent | React.TouchEvent) => {
    onResizeStart(entry.id, 'bottom', e, rect);
  };

  const kind = entry.kind ?? resolveTimeblockDestination(entry.endDate ?? entry.displayEndDate);

  if (kind === 'plan') {
    return (
      <PlanLaneCard
        event={calendarEventToPlanEvent(entry, allEvents)}
        position={previewPosition}
        activityName={activityName}
        activityColor={activityColor}
        activityIcon={activityIcon}
        activityCategoryId={activityCategoryId}
        isActive={isActive}
        disableDrag={disableDrag}
        disableResize={disableResize}
        showDayDiffMarker={showDayDiffMarker}
        compact={compactCards}
        timeFormat={timeFormat}
        styleOverride={styleOverride}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onResizeStart={handleResizeStart}
      />
    );
  }

  return (
    <RecordLaneCard
      event={calendarEventToRecordEvent(entry)}
      position={previewPosition}
      activityName={activityName}
      activityColor={activityColor}
      activityIcon={activityIcon}
      activityCategoryId={activityCategoryId}
      isActive={isActive}
      disableDrag={disableDrag}
      showDayDiffMarker={showDayDiffMarker}
      compact={compactCards}
      timeFormat={timeFormat}
      styleOverride={styleOverride}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onResizeStart={handleResizeStart}
    />
  );
}
