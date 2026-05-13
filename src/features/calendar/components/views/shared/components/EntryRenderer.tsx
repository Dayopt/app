'use client';

import React from 'react';

import {
  EntryCard,
  computeActualTimeDiffOverlay,
  isNewEntry,
  useEntryInspectorStore,
} from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

import type { InteractionState } from '../../../../interaction/types';
import type { CalendarEvent } from '../../../../types/calendar.types';
import { getAdjustedStyle, getPreviewTime } from '../utils/interactionHelpers';

// ========================================
// Types
// ========================================

interface EntryRendererProps {
  entry: CalendarEvent;
  style: React.CSSProperties;
  hourHeight: number;
  enableCrossDayDrag: boolean;
  dayIndex: number;
  isDragging: boolean;
  isResizing: boolean;
  entryDragging: boolean;
  entryResizing: boolean;
  interactionState: InteractionState;
  globalDraggedEntryId: string | null;
  isSourceColumnMovingAway: boolean;
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
  onGapClick?: ((startMinutes: number, endMinutes: number) => void) | undefined;
  entries: CalendarEvent[];
}

// ========================================
// Component
// ========================================

/** 単一エントリの描画（スタイル計算・インタラクション・カード表示） */
export const EntryRenderer = React.memo(function EntryRenderer({
  entry,
  style,
  hourHeight,
  enableCrossDayDrag,
  dayIndex,
  isDragging,
  isResizing,
  entryDragging,
  entryResizing,
  interactionState,
  globalDraggedEntryId,
  isSourceColumnMovingAway,
  onEntryClick,
  onEntryContextMenu,
  onPointerDown,
  onTouchStart,
  onResizeStart,
  onGapClick,
  entries,
}: EntryRendererProps) {
  const t = useTranslations();
  const inspectorEntryId = useEntryInspectorStore((state) => state.entryId);
  const isInspectorOpen = useEntryInspectorStore((state) => state.isOpen);
  const setAnchorRect = useEntryInspectorStore((state) => state.setAnchorRect);
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const currentTop = parseFloat(style.top?.toString() || '0');
  const currentHeight = parseFloat(style.height?.toString() || '20');

  // ドラッグ中は元位置にファントム（半透明シルエット）を残す
  const adjustedStyle: React.CSSProperties = entryDragging
    ? { ...style, opacity: 0.65 }
    : getAdjustedStyle(style, entry.id, interactionState);

  // 予定 vs 記録の差分オーバーレイ（multi-column ビューのみ）
  let finalStyle: React.CSSProperties = adjustedStyle;
  let finalHeight: number;

  if (enableCrossDayDrag) {
    const overlay = computeActualTimeDiffOverlay(entry, hourHeight);
    const overlayAdjustedStyle = {
      ...adjustedStyle,
      top: `${parseFloat(adjustedStyle.top?.toString() || '0') - overlay.topShift}px`,
      height: `${parseFloat(adjustedStyle.height?.toString() || '20') + overlay.heightDelta}px`,
    };

    // 日付間移動中のエントリは元のカラムで半透明
    const isMovingToOtherDate = isSourceColumnMovingAway && globalDraggedEntryId === entry.id;

    finalStyle = isMovingToOtherDate
      ? { ...overlayAdjustedStyle, opacity: 0.65 }
      : overlayAdjustedStyle;

    finalHeight =
      entryResizing && interactionState.mode === 'resizing'
        ? interactionState.snappedHeight
        : currentHeight + overlay.heightDelta;
  } else {
    finalHeight =
      entryResizing && interactionState.mode === 'resizing'
        ? interactionState.snappedHeight
        : currentHeight;
  }

  const handleContextMenu = (p: CalendarEvent, e: React.MouseEvent) => {
    if (isDragging || isResizing) return;
    onEntryContextMenu?.(p, e);
  };

  return (
    <div style={finalStyle} className="pointer-events-none absolute" data-entry-wrapper="true">
      <div
        className="pointer-events-auto absolute inset-0 rounded-lg"
        data-entry-block="true"
        tabIndex={0}
        role="button"
        aria-label={entry.title || t('entry.untitled')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEntryClick?.(entry);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIndex = entries.indexOf(entry);
            const nextIndex =
              e.key === 'ArrowDown'
                ? Math.min(currentIndex + 1, entries.length - 1)
                : Math.max(currentIndex - 1, 0);
            if (nextIndex !== currentIndex) {
              const nextWrapper = e.currentTarget
                .closest('[data-calendar-grid]')
                ?.querySelectorAll<HTMLElement>('[data-entry-block]');
              nextWrapper?.[nextIndex]?.focus();
            }
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            onPointerDown(
              entry.id,
              e,
              { top: currentTop, left: 0, width: 100, height: currentHeight },
              enableCrossDayDrag ? dayIndex : undefined,
            );
          }
        }}
        onTouchStart={(e) => {
          onTouchStart(
            entry.id,
            e,
            { top: currentTop, left: 0, width: 100, height: currentHeight },
            enableCrossDayDrag ? dayIndex : undefined,
          );
        }}
      >
        <EntryCard
          entry={entry}
          tagName={entry.tagId ? (getTagById(entry.tagId)?.name ?? null) : null}
          tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
          onAnchorRect={setAnchorRect}
          isMobile={isMobile}
          position={{ top: 0, left: 0, width: 100, height: finalHeight }}
          onContextMenu={handleContextMenu}
          onResizeStart={(
            p: CalendarEvent,
            direction: 'top' | 'bottom',
            e: React.MouseEvent | React.TouchEvent,
          ) =>
            onResizeStart(p.id, direction, e, {
              top: currentTop,
              left: 0,
              width: 100,
              height: currentHeight,
            })
          }
          isDragging={entryDragging}
          isResizing={entryResizing}
          isActive={isInspectorOpen && inspectorEntryId === entry.id}
          previewTime={getPreviewTime(entry.id, interactionState)}
          hourHeight={hourHeight}
          onGapClick={onGapClick}
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
});
