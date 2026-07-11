'use client';

/**
 * TwoLane（Plan/Log レーン）カードのインタラクションラッパー（Step 8 flip）。
 *
 * `EntryRenderer` と同じ interaction 契約（useInteraction の handlers/state）を使うが、
 * 描画は kind に応じて `PlanLaneCard` / `LogLaneCard`（presentational）に委譲する。
 * PlanLaneCard/LogLaneCard は自身の `position` prop から絶対座標を描画するため、
 * 追加のラッパー div で位置を持たせない（二重にレーン幅が掛かるのを避ける）。
 * anchorRect 取得・past-plan/auto_migrated ロックは EntryRenderer には無い、
 * time model 固有の関心事としてここに実装する。
 */

import type React from 'react';

import { resolveTimeModelDestination, useEntryInspectorStore } from '@/features/entry';
import { useTagsMap } from '@/features/tags';

import type { InteractionState } from '../../../../domain/interaction/types';
import {
  calendarEventToLogEvent,
  calendarEventToPlanEvent,
} from '../../../../lib/calendar-event-to-lane-event';
import type { TwoLanePosition } from '../../../../lib/two-lane-layout';
import type { CalendarEvent } from '../../../../types/calendar.types';
import { LogLaneCard } from './TwoLane/LogLaneCard';
import { PlanLaneCard } from './TwoLane/PlanLaneCard';

interface TwoLaneEntryRendererProps {
  entry: CalendarEvent;
  position: TwoLanePosition;
  allEvents: CalendarEvent[];
  isDragging: boolean;
  isResizing: boolean;
  interactionState: InteractionState;
  dayIndex: number;
  enableCrossDayDrag: boolean;
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onPointerDown: (
    entryId: string,
    e: React.MouseEvent,
    rect: { top: number; left: number; width: number; height: number },
    dayIndex?: number,
  ) => void;
  onTouchStart: (
    entryId: string,
    e: React.TouchEvent,
    rect: { top: number; left: number; width: number; height: number },
    dayIndex?: number,
  ) => void;
  onResizeStart: (
    entryId: string,
    direction: 'top' | 'bottom',
    e: React.MouseEvent | React.TouchEvent,
    rect: { top: number; left: number; width: number; height: number },
  ) => void;
}

/** auto_migrated log はドラッグ/リサイズを禁止する。 */
function isDragDisabled(entry: CalendarEvent): boolean {
  if (entry.logSource === 'auto_migrated') return true;
  return false;
}

/** 過去Planは時間変更を禁止するが、Logレーンへの記録dropは許可する。 */
function isResizeDisabled(entry: CalendarEvent, now: number): boolean {
  if (entry.kind === 'plan') {
    const end = entry.endDate?.getTime();
    return end != null && end <= now;
  }
  return entry.logSource === 'auto_migrated';
}

/** entry.id を絶対座標 rect として渡すためのヘルパー（useInteraction の EntryRect 契約） */
function toRect(position: TwoLanePosition) {
  return { top: position.top, left: position.left, width: position.width, height: position.height };
}

export function TwoLaneEntryRenderer({
  entry,
  position,
  allEvents,
  isDragging,
  isResizing,
  interactionState,
  dayIndex,
  enableCrossDayDrag,
  onEntryClick,
  onEntryContextMenu,
  onPointerDown,
  onTouchStart,
  onResizeStart,
}: TwoLaneEntryRendererProps) {
  const inspectorEntryId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);
  const setAnchorRect = useEntryInspectorStore((state) => state.setAnchorRect);
  const { getTagById } = useTagsMap();

  const entryDragging =
    isDragging && interactionState.mode === 'dragging' && interactionState.entryId === entry.id;
  const entryResizing =
    isResizing && interactionState.mode === 'resizing' && interactionState.entryId === entry.id;

  // リサイズ中はプレビュー高さを反映する（EntryRenderer の buildResizePreviewEntry 相当）
  const previewPosition: TwoLanePosition =
    interactionState.mode === 'resizing' && interactionState.entryId === entry.id
      ? { ...position, height: interactionState.snappedHeight }
      : position;

  const styleOverride: React.CSSProperties = entryDragging
    ? { opacity: 0.3, zIndex: 1 }
    : entryResizing
      ? { zIndex: 1000 }
      : {};

  const tagColor = entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null;
  const isActive = isInspectorOpen && inspectorEntryId === entry.id;
  // eslint-disable-next-line react-hooks/purity -- 過去 plan / auto_migrated ロック判定。再レンダーごとの now で十分（EntryContextMenu と同じ運用）
  const now = Date.now();
  const disableDrag = isDragDisabled(entry);
  const disableResize = isResizeDisabled(entry, now);
  const rect = toRect(position);

  const handleClick = (_target: unknown, e: React.MouseEvent) => {
    const cardRect = e.currentTarget.getBoundingClientRect();
    setAnchorRect({
      top: cardRect.top,
      right: cardRect.right,
      bottom: cardRect.bottom,
      left: cardRect.left,
      width: cardRect.width,
      height: cardRect.height,
    });
    onEntryClick?.(entry);
  };

  const handleContextMenu = (_target: unknown, e: React.MouseEvent) => {
    if (entryDragging || entryResizing) return;
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

  const kind = entry.kind ?? resolveTimeModelDestination(entry.endDate ?? entry.displayEndDate);

  if (kind === 'plan') {
    return (
      <PlanLaneCard
        event={calendarEventToPlanEvent(entry, allEvents)}
        position={previewPosition}
        tagColor={tagColor}
        isActive={isActive}
        disableDrag={disableDrag}
        disableResize={disableResize}
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
    <LogLaneCard
      event={calendarEventToLogEvent(entry, allEvents)}
      position={previewPosition}
      tagColor={tagColor}
      isActive={isActive}
      disableDrag={disableDrag}
      styleOverride={styleOverride}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onResizeStart={handleResizeStart}
    />
  );
}
