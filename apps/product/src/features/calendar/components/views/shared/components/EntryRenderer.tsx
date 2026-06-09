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

import type { InteractionState } from '../../../../domain/interaction/types';
import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import type { CalendarEvent } from '../../../../types/calendar.types';
import { getAdjustedStyle, getPreviewTime } from '../utils/interactionHelpers';
import { ConflictOverlay } from './ConflictOverlay';

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
  gapCreationCutoffMs?: number | undefined;
  entries: CalendarEvent[];
}

function rangesMatch(
  firstStart: Date | null | undefined,
  firstEnd: Date | null | undefined,
  secondStart: Date | null | undefined,
  secondEnd: Date | null | undefined,
): boolean {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false;
  return (
    firstStart.getTime() === secondStart.getTime() && firstEnd.getTime() === secondEnd.getTime()
  );
}

function shouldSplitPlannedActual(entry: CalendarEvent): boolean {
  if (entry.origin !== 'planned') return false;
  const plannedStart = entry.plannedStartDate ?? entry.startDate;
  const plannedEnd = entry.plannedEndDate ?? entry.endDate;
  const actualStart = entry.actualStartDate;
  const actualEnd = entry.actualEndDate;
  if (!plannedStart || !plannedEnd || !actualStart || !actualEnd) return false;
  if (actualEnd.getTime() <= actualStart.getTime()) return false;
  if (rangesMatch(plannedStart, plannedEnd, actualStart, actualEnd)) return false;

  return (
    actualStart.getTime() < plannedStart.getTime() || actualEnd.getTime() > plannedEnd.getTime()
  );
}

function toPlannedSegmentEntry(entry: CalendarEvent): CalendarEvent {
  const plannedStart = entry.plannedStartDate ?? entry.startDate;
  const plannedEnd = entry.plannedEndDate ?? entry.endDate;

  return {
    ...entry,
    startDate: plannedStart,
    endDate: plannedEnd,
    displayStartDate: plannedStart ?? entry.displayStartDate,
    displayEndDate: plannedEnd ?? entry.displayEndDate,
    actualStartDate: null,
    actualEndDate: null,
  };
}

function toActualSegmentEntry(entry: CalendarEvent): CalendarEvent {
  const actualStart = entry.actualStartDate ?? entry.startDate;
  const actualEnd = entry.actualEndDate ?? entry.endDate;
  const duration =
    actualStart && actualEnd
      ? Math.max(1, Math.round((actualEnd.getTime() - actualStart.getTime()) / 60000))
      : entry.duration;

  return {
    ...entry,
    startDate: actualStart,
    endDate: actualEnd,
    displayStartDate: actualStart ?? entry.displayStartDate,
    displayEndDate: actualEnd ?? entry.displayEndDate,
    plannedStartDate: null,
    plannedEndDate: null,
    duration,
  };
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
  gapCreationCutoffMs,
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

  // リサイズ中のこの entry が他とオーバーラップしている時、赤リング + not-allowed を表示する。
  // drag は GhostRenderer 側で描くため、ここでは resize のみを担当する。
  const isResizingOverlap =
    interactionState.mode === 'resizing' &&
    interactionState.entryId === entry.id &&
    interactionState.isOverlapping;

  // ドラッグ中は元位置にファントム（半透明シルエット）を残す
  const adjustedStyle: React.CSSProperties = entryDragging
    ? { ...style, opacity: 0.65 }
    : getAdjustedStyle(style, entry.id, interactionState);

  // 予定 vs 記録の差分オーバーレイ（multi-column ビューのみ）
  let finalStyle: React.CSSProperties = adjustedStyle;
  let finalHeight: number;
  const previewPlannedHeight =
    entryResizing && interactionState.mode === 'resizing'
      ? interactionState.snappedHeight
      : currentHeight;
  const isGapAvailable = React.useCallback(
    (startMinutes: number, endMinutes: number) =>
      !entries.some((candidate) => {
        if (candidate.id === entry.id || candidate.origin !== 'unplanned') return false;
        const start = candidate.actualStartDate ?? candidate.startDate;
        const end = candidate.actualEndDate ?? candidate.endDate;
        if (!start || !end) return false;
        const candidateStartMinutes = start.getHours() * 60 + start.getMinutes();
        const candidateEndMinutes = end.getHours() * 60 + end.getMinutes();
        return startMinutes < candidateEndMinutes && endMinutes > candidateStartMinutes;
      }),
    [entries, entry.id],
  );

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

    finalHeight = previewPlannedHeight + overlay.heightDelta;
  } else {
    finalHeight = previewPlannedHeight;
  }

  const handleContextMenu = (p: CalendarEvent, e: React.MouseEvent) => {
    if (isDragging || isResizing) return;
    onEntryContextMenu?.(p, e);
  };

  if (shouldSplitPlannedActual(entry) && !entryDragging && !entryResizing) {
    const plannedSegmentEntry = toPlannedSegmentEntry(entry);
    const actualSegmentEntry = toActualSegmentEntry(entry);
    const plannedStart = plannedSegmentEntry.displayStartDate;
    const plannedEnd = plannedSegmentEntry.displayEndDate;
    const actualStart = actualSegmentEntry.displayStartDate;
    const actualEnd = actualSegmentEntry.displayEndDate;
    const plannedPosition = layoutEntryToVerticalPosition(plannedStart, plannedEnd, hourHeight);
    const actualPosition = layoutEntryToVerticalPosition(actualStart, actualEnd, hourHeight);
    const isMovingToOtherDate = isSourceColumnMovingAway && globalDraggedEntryId === entry.id;
    const splitBaseStyle = isMovingToOtherDate
      ? { ...adjustedStyle, opacity: 0.65 }
      : adjustedStyle;
    const plannedStyle: React.CSSProperties = {
      ...splitBaseStyle,
      top: `${plannedPosition.top}px`,
      height: `${plannedPosition.height}px`,
    };
    const plannedZIndex =
      typeof plannedStyle.zIndex === 'number'
        ? plannedStyle.zIndex
        : Number.parseInt(plannedStyle.zIndex?.toString() ?? '10', 10) || 10;
    const actualStyle: React.CSSProperties = {
      ...splitBaseStyle,
      top: `${actualPosition.top}px`,
      height: `${actualPosition.height}px`,
      zIndex: plannedZIndex + 1,
    };

    return (
      <>
        <div
          style={plannedStyle}
          className="pointer-events-none absolute"
          data-entry-wrapper="true"
          data-entry-segment="planned"
        >
          <div
            className="pointer-events-auto absolute inset-0 rounded-lg"
            data-entry-block="true"
            tabIndex={0}
            role="button"
            aria-label={entry.title || t('entry.untitled')}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setAnchorRect({
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              });
              onEntryClick?.(entry);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleContextMenu(entry, e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEntryClick?.(entry);
              }
            }}
            onMouseDown={(e) => {
              if (e.button === 0) {
                onPointerDown(
                  entry.id,
                  e,
                  { top: plannedPosition.top, left: 0, width: 100, height: plannedPosition.height },
                  enableCrossDayDrag ? dayIndex : undefined,
                );
              }
            }}
            onTouchStart={(e) => {
              onTouchStart(
                entry.id,
                e,
                { top: plannedPosition.top, left: 0, width: 100, height: plannedPosition.height },
                enableCrossDayDrag ? dayIndex : undefined,
              );
            }}
          >
            <EntryCard
              entry={plannedSegmentEntry}
              tagName={entry.tagId ? (getTagById(entry.tagId)?.name ?? null) : null}
              tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
              tagIcon={entry.tagId ? (getTagById(entry.tagId)?.icon ?? null) : null}
              onAnchorRect={setAnchorRect}
              isMobile={isMobile}
              position={{ top: 0, left: 0, width: 100, height: plannedPosition.height }}
              plannedHeight={plannedPosition.height}
              onClick={() => onEntryClick?.(entry)}
              onContextMenu={handleContextMenu}
              onResizeStart={(
                p: CalendarEvent,
                direction: 'top' | 'bottom',
                e: React.MouseEvent | React.TouchEvent,
              ) =>
                onResizeStart(p.id, direction, e, {
                  top: plannedPosition.top,
                  left: 0,
                  width: 100,
                  height: plannedPosition.height,
                })
              }
              isDragging={entryDragging}
              isResizing={entryResizing}
              isActive={isInspectorOpen && inspectorEntryId === entry.id}
              previewTime={getPreviewTime(entry.id, interactionState)}
              hourHeight={hourHeight}
              onGapClick={onGapClick}
              isGapAvailable={isGapAvailable}
              gapCreationCutoffMs={gapCreationCutoffMs}
              overlayPositionApplied
              className={cn(
                'h-full w-full',
                entryDragging ? 'cursor-grabbing' : 'cursor-grab',
                isNewEntry(entry.id) && 'animate-entry-pop',
              )}
            />
          </div>
        </div>

        <div
          style={actualStyle}
          className="pointer-events-none absolute"
          data-entry-wrapper="true"
          data-entry-segment="actual"
        >
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
              }
            }}
          >
            <EntryCard
              entry={actualSegmentEntry}
              tagName={entry.tagId ? (getTagById(entry.tagId)?.name ?? null) : null}
              tagColor={entry.tagId ? (getTagById(entry.tagId)?.color ?? null) : null}
              tagIcon={entry.tagId ? (getTagById(entry.tagId)?.icon ?? null) : null}
              onAnchorRect={setAnchorRect}
              isMobile={isMobile}
              position={{ top: 0, left: 0, width: 100, height: actualPosition.height }}
              plannedHeight={actualPosition.height}
              onClick={() => onEntryClick?.(entry)}
              onContextMenu={handleContextMenu}
              isActive={isInspectorOpen && inspectorEntryId === entry.id}
              hourHeight={hourHeight}
              overlayPositionApplied
              disableResize
              className={cn('h-full w-full', isNewEntry(entry.id) && 'animate-entry-pop')}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={finalStyle} className="pointer-events-none absolute" data-entry-wrapper="true">
      <div
        className={cn(
          'pointer-events-auto absolute inset-0 rounded-lg',
          isResizingOverlap && 'cursor-not-allowed',
        )}
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
          tagIcon={entry.tagId ? (getTagById(entry.tagId)?.icon ?? null) : null}
          onAnchorRect={setAnchorRect}
          isMobile={isMobile}
          position={{ top: 0, left: 0, width: 100, height: finalHeight }}
          plannedHeight={previewPlannedHeight}
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
          isGapAvailable={isGapAvailable}
          gapCreationCutoffMs={gapCreationCutoffMs}
          {...(enableCrossDayDrag ? { overlayPositionApplied: true } : {})}
          className={cn(
            'h-full w-full',
            entryDragging ? 'cursor-grabbing' : 'cursor-grab',
            isNewEntry(entry.id) && 'animate-entry-pop',
          )}
        />
        {/* リサイズ中に重複していたら、destructive な重複表示で上書きする（all-red 規範）。
            ドラッグ時のゴースト（ConflictOverlay）と同一 UI に統一する。 */}
        {isResizingOverlap && interactionState.mode === 'resizing' && (
          <ConflictOverlay
            previewTime={interactionState.previewTime}
            message={t('entry.errors.timeOverlap')}
            // EntryCard は rounded-r-lg（左角は四角）なので左角を揃える。
            // rounded-lg のままだと左角が丸まり背面のカード角がはみ出す。
            className="pointer-events-none absolute inset-0 rounded-l-none"
            // EntryCard root は z-index 10（選択中 30）を持つため、その上に重ねる
            style={{ zIndex: 40 }}
          />
        )}
      </div>
    </div>
  );
});
