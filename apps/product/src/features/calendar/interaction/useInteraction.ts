'use client';

/**
 * useInteraction — 統合インタラクションhook
 *
 * 純粋状態機械（machine.ts）をReactに接続する唯一のhook。
 * グローバルイベントリスナー管理、タイマー、触覚フィードバック、
 * ドラッグストア更新をすべてここで実行。
 */

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useHapticFeedback } from '../hooks/accessibility/useHapticFeedback';
import type { CalendarEvent } from '../types/calendar.types';

import { hasCalendarActualRangeDiff } from '../lib/entry-time';
import { checkClientSideOverlap } from '../lib/overlap';
import { useCalendarDragStore } from '../stores/useCalendarDragStore';

import { IDLE, interactionReducer } from '../domain/interaction/machine';
import {
  constrainToRect,
  getPointerPoint,
  isTouchEvent,
} from '../domain/interaction/pointer-tracker';
import type {
  EntryRect,
  InteractionAction,
  InteractionContext,
  InteractionEffect,
  InteractionState,
} from '../domain/interaction/types';

// ========================================
// Types
// ========================================

/** useInteraction フックへの入力プロパティ */
export interface UseInteractionProps {
  /** Base date of the current view */
  date: Date;
  /** Events for the current view */
  events: CalendarEvent[];
  /** Events for overlap checking (defaults to events) */
  allEventsForOverlapCheck?: CalendarEvent[];
  /** Displayed dates (week/multi-day views) */
  displayDates?: Date[];
  /** View mode */
  viewMode?: 'day' | '3day' | '5day' | 'week';
  /** Plan ID to disable dragging (e.g. Inspector-open plan) */
  disabledPlanId?: string | null;
  /** Plan ID to disable resize（move とは独立に制御するため）。Mobile では Inspector 開いている entry も resize 可にしたい場合 null を渡す */
  resizeDisabledPlanId?: string | null;
  /** Pixels per hour */
  hourHeight: number;
  /** Callback when an event is moved or resized */
  onEventUpdate?: (
    eventId: string,
    updates: {
      startTime: Date;
      endTime: Date;
      resetActualTime?: boolean;
      keepActualTime?: boolean;
    },
  ) => Promise<void | { skipToast: true }> | void;
  /** Callback when an event is clicked (not dragged) */
  onEventClick?: (event: CalendarEvent) => void;
  /** Callback when a time range is selected on the grid */
  onTimeRangeSelect?: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;
}

/** useInteraction フックの戻り値 */
export interface UseInteractionReturn {
  /** Current interaction state (discriminated union) */
  state: InteractionState;
  /** Low-level dispatch for custom integrations */
  dispatch: (action: InteractionAction) => void;
  /** Convenience handlers for attaching to DOM elements */
  handlers: InteractionHandlers;
}

/** DOM要素にアタッチするインタラクションハンドラー群 */
export interface InteractionHandlers {
  handlePointerDown: (
    entryId: string,
    e: React.MouseEvent,
    position: EntryRect,
    dateIndex?: number,
  ) => void;
  handleTouchStart: (
    entryId: string,
    e: React.TouchEvent,
    position: EntryRect,
    dateIndex?: number,
  ) => void;
  handleResizeStart: (
    entryId: string,
    direction: 'top' | 'bottom',
    e: React.MouseEvent | React.TouchEvent,
    position: EntryRect,
  ) => void;
}

function getMinutesFromDayStart(date: Date, time: Date): number {
  const dayOffset =
    (Date.UTC(time.getFullYear(), time.getMonth(), time.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
    (24 * 60 * 60 * 1000);
  const wallClockMinutes =
    Math.round(dayOffset) * 24 * 60 + time.getHours() * 60 + time.getMinutes();
  return Math.max(0, Math.min(24 * 60, wallClockMinutes));
}

// ========================================
// Hook
// ========================================

/** 純粋状態機械をReactに接続する統合インタラクションフック */
export function useInteraction(props: UseInteractionProps): UseInteractionReturn {
  const haptic = useHapticFeedback();

  // Drag store actions
  const startDragStore = useCalendarDragStore((s) => s.startDrag);
  const updateDragStore = useCalendarDragStore((s) => s.updateDrag);
  const endDragStore = useCalendarDragStore((s) => s.endDrag);

  // State: ref for authoritative value (avoids stale closures), useState for renders
  const stateRef = useRef<InteractionState>(IDLE);
  const [renderState, setRenderState] = useState<InteractionState>(IDLE);

  // Ref for all mutable dependencies — updated every render, read by stable dispatch
  const latestRef = useRef({
    events: props.events,
    allEvents: props.allEventsForOverlapCheck ?? props.events,
    hourHeight: props.hourHeight,
    date: props.date,
    displayDates: props.displayDates,
    viewMode: props.viewMode ?? 'day',
    disabledPlanId: props.disabledPlanId,
    resizeDisabledPlanId: props.resizeDisabledPlanId,
    onEventClick: props.onEventClick,
    onEventUpdate: props.onEventUpdate,
    onTimeRangeSelect: props.onTimeRangeSelect,
    haptic,
    startDragStore,
    updateDragStore,
    endDragStore,
  });
  latestRef.current = {
    events: props.events,
    allEvents: props.allEventsForOverlapCheck ?? props.events,
    hourHeight: props.hourHeight,
    date: props.date,
    displayDates: props.displayDates,
    viewMode: props.viewMode ?? 'day',
    disabledPlanId: props.disabledPlanId,
    resizeDisabledPlanId: props.resizeDisabledPlanId,
    onEventClick: props.onEventClick,
    onEventUpdate: props.onEventUpdate,
    onTimeRangeSelect: props.onTimeRangeSelect,
    haptic,
    startDragStore,
    updateDragStore,
    endDragStore,
  };

  // Timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cached day-column NodeList — populated at drag-start, cleared on drag-end
  const dayColumnsRef = useRef<NodeListOf<HTMLElement> | null>(null);

  // ---- Build context for the reducer ----
  function buildContext(r: typeof latestRef.current): InteractionContext {
    return {
      hourHeight: r.hourHeight,
      date: r.date,
      ...(r.displayDates ? { displayDates: r.displayDates } : {}),
      viewMode: r.viewMode,
      getEntryDurationMs: (entryId: string) => {
        const event = r.events.find((e) => e.id === entryId);
        if (event?.startDate && event?.endDate) {
          return event.endDate.getTime() - event.startDate.getTime();
        }
        return 3600000; // default 1h
      },
      getResizeMinEndMinutes: (entryId: string) => {
        const event = r.events.find((candidate) => candidate.id === entryId);
        if (!hasCalendarActualRangeDiff(event) || !event?.actualStartDate) return null;
        return event.actualStartDate.getHours() * 60 + event.actualStartDate.getMinutes();
      },
      checkOverlap: (entryId: string, start: Date, end: Date, operation: 'drag' | 'resize') => {
        return checkClientSideOverlap(r.allEvents, entryId, start, end, operation);
      },
    };
  }

  // ---- Process effects ----
  function processEffects(
    effects: InteractionEffect[],
    r: typeof latestRef.current,
    dispatchFn: (action: InteractionAction) => void,
  ): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'START_LONGPRESS_TIMER': {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            const s = stateRef.current;
            if (s.mode === 'longpress-pending') {
              dispatchFn({ type: 'LONGPRESS_FIRED' });
            } else if (s.mode === 'selection-longpress-pending') {
              dispatchFn({ type: 'GRID_LONGPRESS_FIRED' });
            }
          }, effect.delayMs);
          break;
        }

        case 'CLEAR_LONGPRESS_TIMER':
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          break;

        case 'HAPTIC':
          r.haptic[effect.pattern]?.();
          break;

        case 'EVENT_CLICK': {
          const event = r.events.find((e) => e.id === effect.entryId);
          if (event) r.onEventClick?.(event);
          break;
        }

        case 'DROP':
          r.onEventUpdate?.(effect.entryId, {
            startTime: effect.time.start,
            endTime: effect.time.end,
          });
          break;

        case 'DROP_REJECTED':
          // Snap-back animation handled by GhostRenderer
          break;

        case 'RESIZE_COMPLETE': {
          const event = r.events.find((candidate) => candidate.id === effect.entryId);
          r.onEventUpdate?.(effect.entryId, {
            startTime: effect.time.start,
            endTime: effect.time.end,
            ...(hasCalendarActualRangeDiff(event) ? { keepActualTime: true } : {}),
          });
          break;
        }

        case 'RESIZE_REJECTED':
          // Visual feedback handled by state.isOverlapping
          break;

        case 'SELECT_COMPLETE': {
          const selDate = r.displayDates?.[effect.dateIndex] ?? r.date;
          const endMinutes = getMinutesFromDayStart(selDate, effect.range.end);
          r.onTimeRangeSelect?.({
            date: selDate,
            startHour: effect.range.start.getHours(),
            startMinute: effect.range.start.getMinutes(),
            endHour: Math.floor(endMinutes / 60),
            endMinute: endMinutes % 60,
          });
          break;
        }

        case 'DRAG_STORE_START': {
          const plan = r.events.find((e) => e.id === effect.entryId);
          if (plan) r.startDragStore(effect.entryId, plan, effect.dateIndex);
          // Cache day-column elements once at drag-start
          dayColumnsRef.current = document.querySelectorAll<HTMLElement>(
            '[data-calendar-day-index]',
          );
          break;
        }

        case 'DRAG_STORE_UPDATE':
          r.updateDragStore({
            targetDateIndex: effect.targetDateIndex,
            isDragging: true,
          });
          break;

        case 'DRAG_STORE_END':
          r.endDragStore();
          // Clear cached day-column elements
          dayColumnsRef.current = null;
          break;
      }
    }
  }

  // ---- Stable dispatch function ----

  const dispatch = useCallback(function stableDispatch(action: InteractionAction) {
    const r = latestRef.current;
    const ctx = buildContext(r);
    const { state: next, effects } = interactionReducer(stateRef.current, action, ctx);
    stateRef.current = next;
    setRenderState(next);
    processEffects(effects, r, stableDispatch);
  }, []);

  // ---- Cleanup timer on unmount ----
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ---- Global event listeners ----
  useEffect(() => {
    const mode = renderState.mode;
    const needsListeners =
      mode === 'pending' ||
      mode === 'longpress-pending' ||
      mode === 'dragging' ||
      mode === 'resizing' ||
      mode === 'selecting' ||
      mode === 'selection-longpress-pending';

    if (!needsListeners) return;

    function handleGlobalMove(e: MouseEvent | TouchEvent) {
      const raw = getPointerPoint(e);

      // Constrain to calendar container bounds
      const container =
        document.querySelector<HTMLElement>('[data-calendar-main]') ??
        document.querySelector<HTMLElement>('main');
      const point = container ? constrainToRect(raw, container.getBoundingClientRect()) : raw;

      // Calculate target date index for multi-column views
      let targetDateIndex: number | undefined;
      const r = latestRef.current;
      if (r.viewMode !== 'day' && r.displayDates && r.displayDates.length > 1) {
        // Use cached NodeList during drag to avoid querySelectorAll on every pointermove
        const columns =
          dayColumnsRef.current ??
          document.querySelectorAll<HTMLElement>('[data-calendar-day-index]');
        for (const col of columns) {
          const rect = col.getBoundingClientRect();
          if (point.clientX >= rect.left && point.clientX < rect.right) {
            targetDateIndex = parseInt(col.dataset.calendarDayIndex ?? '0', 10);
            break;
          }
        }
        // Fallback: clamp to nearest edge when pointer is outside the grid columns
        if (targetDateIndex === undefined && columns.length > 0) {
          const first = columns[0]!;
          const last = columns[columns.length - 1]!;
          const edge = point.clientX < first.getBoundingClientRect().left ? first : last;
          targetDateIndex = parseInt(edge.dataset.calendarDayIndex ?? '0', 10);
        }
      }

      // Prevent scroll during active drag/resize/select
      if (isTouchEvent(e)) {
        const s = stateRef.current;
        if (s.mode === 'dragging' || s.mode === 'resizing' || s.mode === 'selecting') {
          e.preventDefault();
        }
      }

      dispatch({
        type: 'POINTER_MOVE',
        point,
        ...(targetDateIndex !== undefined ? { targetDateIndex } : {}),
      });
    }

    function handleGlobalUp() {
      dispatch({ type: 'POINTER_UP' });
    }

    document.addEventListener('mousemove', handleGlobalMove, { passive: false });
    document.addEventListener('mouseup', handleGlobalUp);
    document.addEventListener('touchmove', handleGlobalMove, { passive: false });
    document.addEventListener('touchend', handleGlobalUp);
    document.addEventListener('touchcancel', handleGlobalUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMove);
      document.removeEventListener('mouseup', handleGlobalUp);
      document.removeEventListener('touchmove', handleGlobalMove);
      document.removeEventListener('touchend', handleGlobalUp);
      document.removeEventListener('touchcancel', handleGlobalUp);
    };
  }, [renderState.mode, dispatch]);

  // ---- Global cursor management ----
  useEffect(() => {
    const mode = renderState.mode;
    if (mode !== 'dragging' && mode !== 'resizing') return;

    const cursor = mode === 'resizing' ? 'ns-resize' : 'grabbing';
    document.body.style.setProperty('cursor', cursor, 'important');
    document.body.style.setProperty('user-select', 'none', 'important');
    document.documentElement.style.setProperty('cursor', cursor, 'important');

    const style = document.createElement('style');
    style.id = 'interaction-cursor-override';
    style.textContent = `* { cursor: ${cursor} !important; }`;
    document.head.appendChild(style);

    return () => {
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      document.documentElement.style.removeProperty('cursor');
      const el = document.getElementById('interaction-cursor-override');
      if (el) el.remove();
    };
  }, [renderState.mode]);

  // ---- Convenience handlers ----

  const handlePointerDown = useCallback(
    (entryId: string, e: React.MouseEvent, position: EntryRect, dateIndex: number = 0) => {
      if (e.button !== 0) return;
      const r = latestRef.current;
      // Disabled plan → direct click
      if (r.disabledPlanId && entryId === r.disabledPlanId) {
        const event = r.events.find((ev) => ev.id === entryId);
        if (event) r.onEventClick?.(event);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: 'POINTER_DOWN',
        entryId,
        point: getPointerPoint(e.nativeEvent),
        originalPosition: position,
        dateIndex,
      });
    },
    [dispatch],
  );

  const handleTouchStart = useCallback(
    (entryId: string, e: React.TouchEvent, position: EntryRect, dateIndex: number = 0) => {
      const r = latestRef.current;
      if (r.disabledPlanId && entryId === r.disabledPlanId) return;
      dispatch({
        type: 'TOUCH_START',
        entryId,
        point: getPointerPoint(e.nativeEvent),
        originalPosition: position,
        dateIndex,
      });
    },
    [dispatch],
  );

  const handleResizeStart = useCallback(
    (
      entryId: string,
      direction: 'top' | 'bottom',
      e: React.MouseEvent | React.TouchEvent,
      position: EntryRect,
    ) => {
      // マウスイベントの場合は左クリックのみ許可
      if ('button' in e && e.button !== 0) return;
      const r = latestRef.current;
      if (r.resizeDisabledPlanId && entryId === r.resizeDisabledPlanId) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: 'RESIZE_START',
        entryId,
        direction,
        point: getPointerPoint(e.nativeEvent),
        originalPosition: position,
      });
    },
    [dispatch],
  );

  return {
    state: renderState,
    dispatch,
    handlers: {
      handlePointerDown,
      handleTouchStart,
      handleResizeStart,
    },
  };
}
