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

import { isPlanRecordDrop } from '@/features/timeblock';
import { checkClientSideOverlapByKind } from '../lib/overlap';
import { hasCalendarActualRangeDiff } from '../lib/timeblock-time';
import { DEFAULT_PLAN_LANE_WIDTH_PERCENT, resolveTwoLaneFromPointer } from '../lib/two-lane-layout';
import { useCalendarDragStore } from '../stores/useCalendarDragStore';

import { IDLE, interactionReducer } from '../domain/interaction/machine';
import {
  constrainToRect,
  getPointerPoint,
  isTouchEvent,
} from '../domain/interaction/pointer-tracker';
import type {
  InteractionAction,
  InteractionContext,
  InteractionEffect,
  InteractionState,
  TimeblockRect,
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
  /** 2レーン表示のPlan幅（%） */
  planLaneWidthPercent?: number | undefined;
  /** Callback when an event is moved or resized */
  onEventUpdate?: (
    eventId: string,
    updates: {
      startTime: Date;
      endTime: Date;
      resetActualTime?: boolean;
    },
  ) => Promise<void | { skipToast: true }> | void;
  /** Plan を Record レーンへdropした時の記録化 */
  onPlanRecord?: ((planId: string) => void) | undefined;
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
interface UseInteractionReturn {
  /** Current interaction state (discriminated union) */
  state: InteractionState;
  /** Low-level dispatch for custom integrations */
  dispatch: (action: InteractionAction) => void;
  /** Convenience handlers for attaching to DOM elements */
  handlers: InteractionHandlers;
}

/** DOM要素にアタッチするインタラクションハンドラー群 */
interface InteractionHandlers {
  handlePointerDown: (
    timeblockId: string,
    e: React.MouseEvent,
    position: TimeblockRect,
    dateIndex?: number,
  ) => void;
  handleTouchStart: (
    timeblockId: string,
    e: React.TouchEvent,
    position: TimeblockRect,
    dateIndex?: number,
  ) => void;
  handleResizeStart: (
    timeblockId: string,
    direction: 'top' | 'bottom',
    e: React.MouseEvent | React.TouchEvent,
    position: TimeblockRect,
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
    planLaneWidthPercent: props.planLaneWidthPercent ?? DEFAULT_PLAN_LANE_WIDTH_PERCENT,
    date: props.date,
    displayDates: props.displayDates,
    viewMode: props.viewMode ?? 'day',
    disabledPlanId: props.disabledPlanId,
    resizeDisabledPlanId: props.resizeDisabledPlanId,
    onEventClick: props.onEventClick,
    onEventUpdate: props.onEventUpdate,
    onPlanRecord: props.onPlanRecord,
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
    planLaneWidthPercent: props.planLaneWidthPercent ?? DEFAULT_PLAN_LANE_WIDTH_PERCENT,
    date: props.date,
    displayDates: props.displayDates,
    viewMode: props.viewMode ?? 'day',
    disabledPlanId: props.disabledPlanId,
    resizeDisabledPlanId: props.resizeDisabledPlanId,
    onEventClick: props.onEventClick,
    onEventUpdate: props.onEventUpdate,
    onPlanRecord: props.onPlanRecord,
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
  // machine は DRAG_STORE_END → DROP の順でeffectを出すため、drop判定用laneを別refに保持する。
  const dragLaneRef = useRef<{ source: 'plan' | 'record'; target: 'plan' | 'record' } | null>(null);

  // ---- Build context for the reducer ----
  function buildContext(r: typeof latestRef.current): InteractionContext {
    return {
      hourHeight: r.hourHeight,
      date: r.date,
      ...(r.displayDates ? { displayDates: r.displayDates } : {}),
      viewMode: r.viewMode,
      getTimeblockDurationMs: (timeblockId: string) => {
        const event = r.events.find((e) => e.id === timeblockId);
        if (event?.startDate && event?.endDate) {
          return event.endDate.getTime() - event.startDate.getTime();
        }
        return 3600000; // default 1h
      },
      getResizeMinEndMinutes: (timeblockId: string) => {
        const event = r.events.find((candidate) => candidate.id === timeblockId);
        if (!hasCalendarActualRangeDiff(event) || !event?.actualStartDate) return null;
        return event.actualStartDate.getHours() * 60 + event.actualStartDate.getMinutes();
      },
      // 自動記録モデルでは drag / resize とも「planned のみ移動・確定済み actual は固定」で
      // 重複判定が同一なため operation は使わない（machine の API 形状だけ維持する）
      checkOverlap: (
        timeblockId: string,
        start: Date,
        end: Date,
        _operation: 'drag' | 'resize',
      ) => {
        return checkClientSideOverlapByKind(r.allEvents, timeblockId, start, end);
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
          const event = r.events.find((e) => e.id === effect.timeblockId);
          if (event) r.onEventClick?.(event);
          break;
        }

        case 'DROP': {
          const event = r.events.find((candidate) => candidate.id === effect.timeblockId);
          if (
            event?.kind === 'plan' &&
            dragLaneRef.current &&
            isPlanRecordDrop(dragLaneRef.current.source, dragLaneRef.current.target)
          ) {
            r.onPlanRecord?.(effect.timeblockId);
            break;
          }
          // 過去PlanはRecordレーンへの記録dropだけ許可し、同一レーンの時間移動は無視する。
          if (event?.kind === 'plan' && event.endDate && event.endDate.getTime() <= Date.now()) {
            break;
          }
          r.onEventUpdate?.(effect.timeblockId, {
            startTime: effect.time.start,
            endTime: effect.time.end,
          });
          break;
        }

        case 'DROP_REJECTED':
          // Snap-back animation handled by GhostRenderer
          break;

        case 'RESIZE_COMPLETE': {
          // 自動記録モデル: planned の resize は planned のみ更新（確定済み actual は固定、
          // 未編集 actual は NULL のまま）。buildTimeUpdateData が origin 別に処理するため
          // ここで actual の扱いを指定する必要はない。
          r.onEventUpdate?.(effect.timeblockId, {
            startTime: effect.time.start,
            endTime: effect.time.end,
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
          const plan = r.events.find((e) => e.id === effect.timeblockId);
          if (plan) {
            const lane = plan.kind ?? 'plan';
            dragLaneRef.current = { source: lane, target: lane };
            r.startDragStore(effect.timeblockId, plan, effect.dateIndex, lane);
          }
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

        case 'DRAG_STORE_END': {
          const currentDrag = useCalendarDragStore.getState();
          if (currentDrag.sourceLane && currentDrag.targetLane) {
            dragLaneRef.current = {
              source: currentDrag.sourceLane,
              target: currentDrag.targetLane,
            };
          }
          r.endDragStore();
          // Clear cached day-column elements
          dayColumnsRef.current = null;
          break;
        }
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
      let targetColumn: HTMLElement | undefined;
      const columns =
        dayColumnsRef.current ??
        document.querySelectorAll<HTMLElement>('[data-calendar-day-index]');
      if (r.viewMode !== 'day' && r.displayDates && r.displayDates.length > 1) {
        // Use cached NodeList during drag to avoid querySelectorAll on every pointermove
        for (const col of columns) {
          const rect = col.getBoundingClientRect();
          if (point.clientX >= rect.left && point.clientX < rect.right) {
            targetColumn = col;
            targetDateIndex = parseInt(col.dataset.calendarDayIndex ?? '0', 10);
            break;
          }
        }
        // Fallback: clamp to nearest edge when pointer is outside the grid columns
        if (targetDateIndex === undefined && columns.length > 0) {
          const first = columns[0]!;
          const last = columns[columns.length - 1]!;
          const edge = point.clientX < first.getBoundingClientRect().left ? first : last;
          targetColumn = edge;
          targetDateIndex = parseInt(edge.dataset.calendarDayIndex ?? '0', 10);
        }
      }

      if (!targetColumn) {
        targetColumn = Array.from(columns).find((column) => {
          const rect = column.getBoundingClientRect();
          return point.clientX >= rect.left && point.clientX < rect.right;
        });
      }
      if (stateRef.current.mode === 'dragging' && targetColumn) {
        const rect = targetColumn.getBoundingClientRect();
        const targetLane = resolveTwoLaneFromPointer(
          point.clientX,
          rect.left,
          rect.width,
          r.planLaneWidthPercent,
        );
        if (dragLaneRef.current) dragLaneRef.current.target = targetLane;
        r.updateDragStore({ targetLane });
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
    (timeblockId: string, e: React.MouseEvent, position: TimeblockRect, dateIndex: number = 0) => {
      if (e.button !== 0) return;
      const r = latestRef.current;
      // Disabled plan → direct click
      if (r.disabledPlanId && timeblockId === r.disabledPlanId) {
        const event = r.events.find((ev) => ev.id === timeblockId);
        if (event) r.onEventClick?.(event);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: 'POINTER_DOWN',
        timeblockId,
        point: getPointerPoint(e.nativeEvent),
        originalPosition: position,
        dateIndex,
      });
    },
    [dispatch],
  );

  const handleTouchStart = useCallback(
    (timeblockId: string, e: React.TouchEvent, position: TimeblockRect, dateIndex: number = 0) => {
      const r = latestRef.current;
      if (r.disabledPlanId && timeblockId === r.disabledPlanId) return;
      dispatch({
        type: 'TOUCH_START',
        timeblockId,
        point: getPointerPoint(e.nativeEvent),
        originalPosition: position,
        dateIndex,
      });
    },
    [dispatch],
  );

  const handleResizeStart = useCallback(
    (
      timeblockId: string,
      direction: 'top' | 'bottom',
      e: React.MouseEvent | React.TouchEvent,
      position: TimeblockRect,
    ) => {
      // マウスイベントの場合は左クリックのみ許可
      if ('button' in e && e.button !== 0) return;
      const r = latestRef.current;
      if (r.resizeDisabledPlanId && timeblockId === r.resizeDisabledPlanId) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: 'RESIZE_START',
        timeblockId,
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
