'use client';

/**
 * カレンダードラッグ選択ロジック
 *
 * 責務: 時間範囲のドラッグ選択・ダブルクリック・タッチ操作。
 * ドロップゾーン管理は CalendarDropZone に移管済み。
 *
 * useSelectionEvents を統合し、useReducer でシンプルに状態管理。
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { useTranslations } from 'next-intl';

import { formatTimeString } from '@/lib/date';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { toast } from '@/lib/toast';

import {
  calculateSelection,
  createInstantSelection,
} from '../../../../../domain/interaction/selection-rules';
import { pixelsToTime as pixelsToTimeRaw } from '../../../../../domain/interaction/time-math';
import { useHapticFeedback } from '../../../../../hooks/accessibility/useHapticFeedback';
import { checkClientSideOverlap } from '../../../../../lib/overlap';
import { HOUR_HEIGHT } from '../../constants/grid.constants';

import type { CalendarEvent } from '../../../../../types/calendar.types';
import type { DateTimeSelection, TimeRange } from './types';
import { DRAG_CONSTANTS } from './types';

// ========================================
// Types
// ========================================

interface UseDragSelectionOptions {
  date: Date;
  dayIndex?: number | undefined;
  disabled?: boolean | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  onDoubleClick?: ((selection: DateTimeSelection) => void) | undefined;
  plans?: CalendarEvent[] | undefined;
  hourHeight?: number | undefined;
}

interface UseDragSelectionReturn {
  isSelecting: boolean;
  selection: TimeRange | null;
  showSelectionPreview: boolean;
  isOverlapping: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  formatTime: (hour: number, minute: number) => string;
}

// ========================================
// Reducer
// ========================================

type SelectionMode =
  | { type: 'idle' }
  | {
      type: 'mouse-selecting';
      start: { hour: number; minute: number };
      startPixelY: number;
      hasDragged: boolean;
      selection: TimeRange;
      isOverlapping: boolean;
    }
  | {
      type: 'touch-pending';
      startPixelY: number;
      startPos: { x: number; y: number };
      startTime: { hour: number; minute: number };
    }
  | {
      type: 'touch-selecting';
      start: { hour: number; minute: number };
      startPixelY: number;
      hasDragged: boolean;
      selection: TimeRange;
      isOverlapping: boolean;
    }
  | {
      type: 'show-external';
      selection: TimeRange;
    };

type SelectionAction =
  | { type: 'MOUSE_DOWN'; start: { hour: number; minute: number }; startPixelY: number }
  | { type: 'MOUSE_MOVE'; selection: TimeRange; hasDragged: boolean; isOverlapping: boolean }
  | { type: 'MOUSE_UP' }
  | {
      type: 'TOUCH_START';
      startTime: { hour: number; minute: number };
      startPixelY: number;
      startPos: { x: number; y: number };
    }
  | { type: 'LONGPRESS_FIRED'; start: { hour: number; minute: number }; startPixelY: number }
  | { type: 'TOUCH_MOVE'; selection: TimeRange; hasDragged: boolean; isOverlapping: boolean }
  | { type: 'TOUCH_END' }
  | { type: 'CANCEL' }
  | { type: 'SHOW_EXTERNAL'; selection: TimeRange };

const IDLE: SelectionMode = { type: 'idle' };

function selectionReducer(state: SelectionMode, action: SelectionAction): SelectionMode {
  switch (action.type) {
    case 'MOUSE_DOWN':
      return {
        type: 'mouse-selecting',
        start: action.start,
        startPixelY: action.startPixelY,
        hasDragged: false,
        selection: {
          startHour: action.start.hour,
          startMinute: action.start.minute,
          endHour: action.start.hour,
          endMinute: action.start.minute + 15,
        },
        isOverlapping: false,
      };
    case 'MOUSE_MOVE':
      if (state.type !== 'mouse-selecting') return state;
      return {
        ...state,
        selection: action.selection,
        hasDragged: action.hasDragged,
        isOverlapping: action.isOverlapping,
      };
    case 'MOUSE_UP':
    case 'TOUCH_END':
    case 'CANCEL':
      return IDLE;
    case 'TOUCH_START':
      return {
        type: 'touch-pending',
        startPixelY: action.startPixelY,
        startPos: action.startPos,
        startTime: action.startTime,
      };
    case 'LONGPRESS_FIRED':
      return {
        type: 'touch-selecting',
        start: action.start,
        startPixelY: action.startPixelY,
        hasDragged: false,
        selection: {
          startHour: action.start.hour,
          startMinute: action.start.minute,
          endHour: action.start.hour,
          endMinute: action.start.minute + 15,
        },
        isOverlapping: false,
      };
    case 'TOUCH_MOVE':
      if (state.type !== 'touch-selecting') return state;
      return {
        ...state,
        selection: action.selection,
        hasDragged: action.hasDragged,
        isOverlapping: action.isOverlapping,
      };
    case 'SHOW_EXTERNAL':
      return { type: 'show-external', selection: action.selection };
    default:
      return state;
  }
}

// ========================================
// Hook
// ========================================

export function useDragSelection({
  date,
  disabled = false,
  onTimeRangeSelect,
  onDoubleClick: onDoubleClickProp,
  plans = [],
  hourHeight = HOUR_HEIGHT,
}: UseDragSelectionOptions): UseDragSelectionReturn {
  const defaultDuration = useUserPreferenceStore((state) => state.defaultDuration);
  const { tap } = useHapticFeedback();
  const t = useTranslations('entry');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId = useRef<number | null>(null);
  const lastSnapRef = useRef<{ startMin: number; endMin: number } | null>(null);

  const [mode, dispatch] = useReducer(selectionReducer, IDLE);

  // Stable refs for latest props (global event handlers 用)
  const propsRef = useRef({
    date,
    disabled,
    defaultDuration,
    onTimeRangeSelect,
    onDoubleClickProp,
    hourHeight,
    tap,
    plans,
    t,
  });
  // eslint-disable-next-line react-hooks/refs -- ref mirrors: レンダー中に同期し、イベントハンドラーでのみ読み取る
  propsRef.current = {
    date,
    disabled,
    defaultDuration,
    onTimeRangeSelect,
    onDoubleClickProp,
    hourHeight,
    tap,
    plans,
    t,
  };

  const pixelsToTime = useCallback((y: number) => pixelsToTimeRaw(y, hourHeight), [hourHeight]);

  const formatTime = useCallback((hour: number, minute: number): string => {
    return formatTimeString(hour, minute);
  }, []);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ---- React event handlers ----

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-event-block]') || target.closest('[data-plan-block]')) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const time = pixelsToTime(e.clientY - rect.top);
      const handler = onDoubleClickProp || onTimeRangeSelect;
      if (handler) {
        const selection = createInstantSelection(time, date, defaultDuration);
        const startTime = new Date(date);
        startTime.setHours(selection.startHour, selection.startMinute, 0, 0);
        const endTime = new Date(date);
        endTime.setHours(selection.endHour, selection.endMinute, 0, 0);
        if (checkClientSideOverlap(plans, '', startTime, endTime)) {
          toast.error(t('errors.timeOverlap'));
        } else {
          handler(selection);
        }
      }
      e.preventDefault();
      e.stopPropagation();
    },
    [pixelsToTime, disabled, onDoubleClickProp, onTimeRangeSelect, date, defaultDuration, plans, t],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('[data-event-block]') || target.closest('[data-plan-block]')) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const start = pixelsToTime(y);
      dispatch({ type: 'MOUSE_DOWN', start, startPixelY: y });
      lastSnapRef.current = null;
      e.preventDefault();
      e.stopPropagation();
    },
    [pixelsToTime, disabled],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-event-block]') || target.closest('[data-plan-block]')) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      const startTime = pixelsToTime(y);

      dispatch({
        type: 'TOUCH_START',
        startTime,
        startPixelY: y,
        startPos: { x: touch.clientX, y: touch.clientY },
      });
      lastSnapRef.current = null;

      clearTimer();
      longPressTimer.current = setTimeout(() => {
        dispatch({ type: 'LONGPRESS_FIRED', start: startTime, startPixelY: y });
        propsRef.current.tap();
      }, DRAG_CONSTANTS.LONG_PRESS_DURATION);
    },
    [pixelsToTime, disabled, clearTimer],
  );

  // ---- Global event listeners ----

  const isActive =
    mode.type === 'mouse-selecting' ||
    mode.type === 'touch-selecting' ||
    mode.type === 'touch-pending';

  useEffect(() => {
    if (!isActive) return;

    const onMouseMove = (e: MouseEvent) => {
      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (!containerRef.current) return;
        if (mode.type !== 'mouse-selecting') return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const current = pixelsToTimeRaw(y, propsRef.current.hourHeight);
        const sel = calculateSelection(mode.start, current);

        const hasDragged =
          mode.hasDragged || Math.abs(y - mode.startPixelY) > DRAG_CONSTANTS.MIN_DRAG_DISTANCE;

        // ハプティック
        const startMin = sel.startHour * 60 + sel.startMinute;
        const endMin = sel.endHour * 60 + sel.endMinute;
        if (
          lastSnapRef.current &&
          (startMin !== lastSnapRef.current.startMin || endMin !== lastSnapRef.current.endMin)
        ) {
          propsRef.current.tap();
        }
        lastSnapRef.current = { startMin, endMin };

        const startTime = new Date(propsRef.current.date);
        startTime.setHours(sel.startHour, sel.startMinute, 0, 0);
        const endTime = new Date(propsRef.current.date);
        endTime.setHours(sel.endHour, sel.endMinute, 0, 0);
        const isOverlapping = checkClientSideOverlap(
          propsRef.current.plans,
          '',
          startTime,
          endTime,
        );

        dispatch({ type: 'MOUSE_MOVE', selection: sel, hasDragged, isOverlapping });
      });
    };

    const onMouseUp = () => {
      const p = propsRef.current;
      if (p.disabled) {
        dispatch({ type: 'CANCEL' });
        return;
      }
      if (mode.type === 'mouse-selecting' && mode.hasDragged) {
        if (mode.isOverlapping) {
          toast.error(p.t('errors.timeOverlap'));
        } else if (p.onTimeRangeSelect) {
          p.onTimeRangeSelect({ date: p.date, ...mode.selection });
        }
      }
      dispatch({ type: 'MOUSE_UP' });
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      // touch-pending: 長押し前に動いたらキャンセル
      // 縦方向は閾値を低くしてスクロールに素早く譲る
      if (mode.type === 'touch-pending') {
        const dx = Math.abs(touch.clientX - mode.startPos.x);
        const dy = Math.abs(touch.clientY - mode.startPos.y);
        if (
          dx > DRAG_CONSTANTS.LONG_PRESS_MOVE_THRESHOLD ||
          dy > DRAG_CONSTANTS.LONG_PRESS_VERTICAL_THRESHOLD
        ) {
          clearTimer();
          dispatch({ type: 'CANCEL' });
        }
        return;
      }

      if (mode.type !== 'touch-selecting' || !containerRef.current) return;

      // スクロール抑制（ドラッグ中のみ）
      const rect = containerRef.current.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      if (Math.abs(y - mode.startPixelY) > DRAG_CONSTANTS.MIN_DRAG_DISTANCE) {
        e.preventDefault();
      }

      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (!containerRef.current || mode.type !== 'touch-selecting') return;

        const touchRect = containerRef.current.getBoundingClientRect();
        const touchY = touch.clientY - touchRect.top;
        const current = pixelsToTimeRaw(touchY, propsRef.current.hourHeight);
        const sel = calculateSelection(mode.start, current);

        const hasDragged =
          mode.hasDragged || Math.abs(touchY - mode.startPixelY) > DRAG_CONSTANTS.MIN_DRAG_DISTANCE;

        const startMin = sel.startHour * 60 + sel.startMinute;
        const endMin = sel.endHour * 60 + sel.endMinute;
        if (
          lastSnapRef.current &&
          (startMin !== lastSnapRef.current.startMin || endMin !== lastSnapRef.current.endMin)
        ) {
          propsRef.current.tap();
        }
        lastSnapRef.current = { startMin, endMin };

        const startTime = new Date(propsRef.current.date);
        startTime.setHours(sel.startHour, sel.startMinute, 0, 0);
        const endTime = new Date(propsRef.current.date);
        endTime.setHours(sel.endHour, sel.endMinute, 0, 0);
        const isOverlapping = checkClientSideOverlap(
          propsRef.current.plans,
          '',
          startTime,
          endTime,
        );

        dispatch({ type: 'TOUCH_MOVE', selection: sel, hasDragged, isOverlapping });
      });
    };

    const onTouchEnd = (_e: TouchEvent) => {
      clearTimer();
      const p = propsRef.current;
      const handler = p.onDoubleClickProp || p.onTimeRangeSelect;

      // touch-pending: シングルタップは無視（長押しのみでエントリー作成）
      if (mode.type === 'touch-pending') {
        dispatch({ type: 'TOUCH_END' });
        return;
      }

      if (mode.type !== 'touch-selecting') {
        dispatch({ type: 'CANCEL' });
        return;
      }
      if (p.disabled) {
        dispatch({ type: 'CANCEL' });
        return;
      }

      const sel = mode.selection;
      if (mode.hasDragged) {
        if (mode.isOverlapping) {
          toast.error(p.t('errors.timeOverlap'));
        } else if (p.onTimeRangeSelect) {
          p.onTimeRangeSelect({ date: p.date, ...sel });
        }
      } else if (handler) {
        // クライアント側overlap検出（サーバーエラーを未然に防ぐ）
        const startTime = new Date(p.date);
        startTime.setHours(sel.startHour, sel.startMinute, 0, 0);
        const endTotal = Math.min(
          sel.startHour * 60 + sel.startMinute + p.defaultDuration,
          24 * 60 - 1,
        );
        const endTime = new Date(p.date);
        endTime.setHours(Math.floor(endTotal / 60), endTotal % 60, 0, 0);

        if (checkClientSideOverlap(p.plans, '', startTime, endTime)) {
          toast.error(p.t('errors.timeOverlap'));
          dispatch({ type: 'CANCEL' });
          return;
        }

        handler(
          createInstantSelection(
            { hour: sel.startHour, minute: sel.startMinute },
            p.date,
            p.defaultDuration,
          ),
        );
      }
      dispatch({ type: 'TOUCH_END' });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimer();
        dispatch({ type: 'CANCEL' });
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('keydown', onKeyDown);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [isActive, mode, clearTimer]);

  // Custom events: calendar-drag-cancel / calendar-show-selection
  useEffect(() => {
    const onCancel = () => {
      clearTimer();
      dispatch({ type: 'CANCEL' });
    };
    const onShowSelection = (e: CustomEvent) => {
      const { date: eventDate, startHour, startMinute, endHour, endMinute } = e.detail;
      if (new Date(eventDate).toDateString() === date.toDateString()) {
        dispatch({
          type: 'SHOW_EXTERNAL',
          selection: { startHour, startMinute, endHour, endMinute },
        });
      }
    };
    window.addEventListener('calendar-drag-cancel', onCancel);
    window.addEventListener('calendar-show-selection', onShowSelection as EventListener);
    return () => {
      window.removeEventListener('calendar-drag-cancel', onCancel);
      window.removeEventListener('calendar-show-selection', onShowSelection as EventListener);
    };
  }, [date, clearTimer]);

  // Derived state
  const selection =
    mode.type === 'mouse-selecting' || mode.type === 'touch-selecting'
      ? mode.selection
      : mode.type === 'show-external'
        ? mode.selection
        : null;

  const showSelectionPreview =
    (mode.type === 'mouse-selecting' && mode.hasDragged) ||
    (mode.type === 'touch-selecting' && mode.hasDragged) ||
    mode.type === 'show-external';

  const isOverlapping =
    mode.type === 'mouse-selecting' || mode.type === 'touch-selecting' ? mode.isOverlapping : false;

  return {
    isSelecting: isActive,
    selection,
    showSelectionPreview,
    isOverlapping,
    containerRef,
    handleMouseDown,
    handleDoubleClick,
    handleTouchStart,
    formatTime,
  };
}
