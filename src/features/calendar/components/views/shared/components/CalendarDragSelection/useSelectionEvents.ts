'use client';

/**
 * ドラッグ選択のマウス・タッチイベントハンドラー
 * グローバルイベントリスナーの登録・解除を含む
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useHapticFeedback } from '../../../../../hooks/accessibility/useHapticFeedback';

import type { DateTimeSelection, TimeRange } from './types';
import { DRAG_CONSTANTS } from './types';

/** useSelectionEvents フックのオプション */
interface UseSelectionEventsOptions {
  date: Date;
  disabled: boolean;
  defaultDuration: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  onDoubleClick?: ((selection: DateTimeSelection) => void) | undefined;
  pixelsToTime: (y: number) => { hour: number; minute: number };
  checkOverlap: (sel: TimeRange) => boolean;
}

/** useSelectionEvents フックの戻り値 */
interface UseSelectionEventsReturn {
  isSelecting: boolean;
  selection: TimeRange | null;
  showSelectionPreview: boolean;
  isOverlapping: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
}

/** マウス・タッチイベントハンドラーとグローバルリスナーを管理するフック */
export function useSelectionEvents({
  date,
  disabled,
  defaultDuration,
  containerRef,
  onTimeRangeSelect,
  onDoubleClick: onDoubleClickProp,
  pixelsToTime,
  checkOverlap,
}: UseSelectionEventsOptions): UseSelectionEventsReturn {
  const { tap } = useHapticFeedback();

  // Refs
  const isDragging = useRef(false);
  const lastSelectionRef = useRef<{ startMinutes: number; endMinutes: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef<number | null>(null);
  /** ドラッグ距離計算用の実際のマウスダウン/タッチ位置（コンテナ相対px） */
  const dragStartPixelY = useRef<number | null>(null);
  /** RAF スロットル用 */
  const rafId = useRef<number | null>(null);

  // State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ hour: number; minute: number } | null>(
    null,
  );
  const [showSelectionPreview, setShowSelectionPreview] = useState(false);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const [isOverlapping, setIsOverlapping] = useState(false);

  // Ref mirrors — グローバルイベントハンドラーから最新値を読み取るため
  // （useEffect の依存配列からホットパス値を除外し、リスナー再登録を抑制）
  // これらの ref はレンダー中に更新するがイベントハンドラーでのみ読み取るため安全。
  // useEffect での同期は1フレーム遅延を生じドラッグの正確性に影響する。
  /* eslint-disable react-hooks/refs -- ref mirrors: レンダー中に同期し、イベントハンドラーでのみ読み取る */
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const selectionStartRef = useRef(selectionStart);
  selectionStartRef.current = selectionStart;
  const isOverlappingRef = useRef(isOverlapping);
  isOverlappingRef.current = isOverlapping;
  const isLongPressActiveRef = useRef(isLongPressActive);
  isLongPressActiveRef.current = isLongPressActive;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Callback refs — props/hookの最新参照を保持
  const pixelsToTimeRef = useRef(pixelsToTime);
  pixelsToTimeRef.current = pixelsToTime;
  const onTimeRangeSelectRef = useRef(onTimeRangeSelect);
  onTimeRangeSelectRef.current = onTimeRangeSelect;
  const onDoubleClickPropRef = useRef(onDoubleClickProp);
  onDoubleClickPropRef.current = onDoubleClickProp;
  const checkOverlapRef = useRef(checkOverlap);
  checkOverlapRef.current = checkOverlap;
  const dateRef = useRef(date);
  dateRef.current = date;
  const defaultDurationRef = useRef(defaultDuration);
  defaultDurationRef.current = defaultDuration;
  const tapRef = useRef(tap);
  tapRef.current = tap;
  /* eslint-enable react-hooks/refs */

  // Helper: 長押しタイマーをクリア
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
    touchStartTime.current = null;
    setIsLongPressActive(false);
  }, []);

  // Helper: 状態をクリア
  const clearSelectionState = useCallback(() => {
    setIsSelecting(false);
    setSelection(null);
    setSelectionStart(null);
    setShowSelectionPreview(false);
    setIsOverlapping(false);
    isDragging.current = false;
    lastSelectionRef.current = null;
    dragStartPixelY.current = null;
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  // Handler: ダブルクリック（左クリックのみ）
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || e.button !== 0) return;

      const target = e.target as HTMLElement;
      const eventBlock =
        target.closest('[data-event-block]') || target.closest('[data-plan-block]');
      if (eventBlock) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const clickTime = pixelsToTime(y);

      const doubleClickHandler = onDoubleClickProp || onTimeRangeSelect;
      if (doubleClickHandler) {
        const startTotalMinutes = clickTime.hour * 60 + clickTime.minute;
        const endTotalMinutes = Math.min(startTotalMinutes + defaultDuration, 24 * 60 - 1);
        const endHour = Math.floor(endTotalMinutes / 60);
        const endMinute = endTotalMinutes % 60;

        const dateTimeSelection: DateTimeSelection = {
          date,
          startHour: clickTime.hour,
          startMinute: clickTime.minute,
          endHour,
          endMinute,
        };

        doubleClickHandler(dateTimeSelection);
      }

      e.preventDefault();
      e.stopPropagation();
    },
    [pixelsToTime, disabled, onDoubleClickProp, onTimeRangeSelect, date, defaultDuration],
  );

  // Handler: マウスダウン（左クリックのみ）
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 右クリック等は無視（左クリックのみドラッグ選択を開始）
      if (e.button !== 0) return;

      if (disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const target = e.target as HTMLElement;
      const eventBlock =
        target.closest('[data-event-block]') || target.closest('[data-plan-block]');

      if (eventBlock) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      dragStartPixelY.current = y;

      const startTime = pixelsToTime(y);

      setSelectionStart(startTime);
      setSelection({
        startHour: startTime.hour,
        startMinute: startTime.minute,
        endHour: startTime.hour,
        endMinute: startTime.minute + 15,
      });
      setIsSelecting(true);
      isDragging.current = false;

      e.preventDefault();
      e.stopPropagation();
    },
    [pixelsToTime, disabled],
  );

  // Handler: タッチ開始
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;

      const touch = e.touches[0];
      if (!touch) return;

      const target = e.target as HTMLElement;
      const eventBlock =
        target.closest('[data-event-block]') || target.closest('[data-plan-block]');

      if (eventBlock) return;

      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      touchStartTime.current = Date.now();

      const rect = e.currentTarget.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      dragStartPixelY.current = y;
      const startTime = pixelsToTime(y);

      clearLongPressTimer();
      longPressTimer.current = setTimeout(() => {
        setIsLongPressActive(true);
        setSelectionStart(startTime);
        setSelection({
          startHour: startTime.hour,
          startMinute: startTime.minute,
          endHour: startTime.hour,
          endMinute: startTime.minute + 15,
        });
        setIsSelecting(true);
        isDragging.current = false;

        tap();
      }, DRAG_CONSTANTS.LONG_PRESS_DURATION);
    },
    [pixelsToTime, disabled, clearLongPressTimer, tap],
  );

  // Effect: グローバルマウス/タッチイベント（ドラッグ中）
  // 依存配列は isSelecting のみ — ホットパス値は ref 経由で読み取り、
  // ドラッグ中のリスナー再登録を排除
  useEffect(() => {
    if (!isSelecting) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (rafId.current !== null) return; // RAF スロットル: 前フレーム未処理なら skip
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (!containerRef.current || !selectionStartRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const currentTime = pixelsToTimeRef.current(y);

        // 実際のマウスダウン位置からの距離でドラッグ判定（グリッドスナップ位置ではなく）
        const rawStartY = dragStartPixelY.current ?? y;
        const deltaY = Math.abs(y - rawStartY);
        if (deltaY > DRAG_CONSTANTS.MIN_DRAG_DISTANCE) {
          isDragging.current = true;
          setShowSelectionPreview(true);
        }

        const newSelection = calculateSelection(selectionStartRef.current, currentTime);

        // ハプティックフィードバック
        const newStartMinutes = newSelection.startHour * 60 + newSelection.startMinute;
        const newEndMinutes = newSelection.endHour * 60 + newSelection.endMinute;
        if (lastSelectionRef.current) {
          const { startMinutes: prevStart, endMinutes: prevEnd } = lastSelectionRef.current;
          if (newStartMinutes !== prevStart || newEndMinutes !== prevEnd) {
            tapRef.current();
          }
        }
        lastSelectionRef.current = { startMinutes: newStartMinutes, endMinutes: newEndMinutes };

        setSelection(newSelection);
        setIsOverlapping(checkOverlapRef.current(newSelection));
      });
    };

    const handleGlobalMouseUp = () => {
      if (disabledRef.current) {
        clearSelectionState();
        return;
      }

      const sel = selectionRef.current;
      const start = selectionStartRef.current;
      if (sel && start) {
        if (isDragging.current && onTimeRangeSelectRef.current) {
          if (isOverlappingRef.current) {
            clearSelectionState();
            return;
          }

          const dateTimeSelection: DateTimeSelection = {
            date: dateRef.current,
            startHour: sel.startHour,
            startMinute: sel.startMinute,
            endHour: sel.endHour,
            endMinute: sel.endMinute,
          };

          onTimeRangeSelectRef.current(dateTimeSelection);
          setIsSelecting(false);
          setShowSelectionPreview(false);
          isDragging.current = false;
          return;
        }
      }

      clearSelectionState();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelectionState();
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (touchStartPos.current && !isLongPressActiveRef.current) {
        const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

        if (
          deltaX > DRAG_CONSTANTS.LONG_PRESS_MOVE_THRESHOLD ||
          deltaY > DRAG_CONSTANTS.LONG_PRESS_MOVE_THRESHOLD
        ) {
          clearLongPressTimer();
          return;
        }
      }

      if (!containerRef.current || !selectionStartRef.current || !isLongPressActiveRef.current)
        return;

      // タッチドラッグ中はスクロール抑制が必要なため、preventDefault は RAF 外で即座に呼ぶ
      const rect = containerRef.current.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      const rawStartY = dragStartPixelY.current ?? y;
      const deltaY = Math.abs(y - rawStartY);
      if (deltaY > DRAG_CONSTANTS.MIN_DRAG_DISTANCE) {
        e.preventDefault();
      }

      if (rafId.current !== null) return; // RAF スロットル
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (!containerRef.current || !selectionStartRef.current) return;

        const touchRect = containerRef.current.getBoundingClientRect();
        const touchY = touch.clientY - touchRect.top;
        const currentTime = pixelsToTimeRef.current(touchY);

        const touchRawStartY = dragStartPixelY.current ?? touchY;
        const touchDeltaY = Math.abs(touchY - touchRawStartY);
        if (touchDeltaY > DRAG_CONSTANTS.MIN_DRAG_DISTANCE) {
          isDragging.current = true;
          setShowSelectionPreview(true);
        }

        const newSelection = calculateSelection(selectionStartRef.current, currentTime);

        const newStartMinutes = newSelection.startHour * 60 + newSelection.startMinute;
        const newEndMinutes = newSelection.endHour * 60 + newSelection.endMinute;
        if (lastSelectionRef.current) {
          const { startMinutes: prevStart, endMinutes: prevEnd } = lastSelectionRef.current;
          if (newStartMinutes !== prevStart || newEndMinutes !== prevEnd) {
            tapRef.current();
          }
        }
        lastSelectionRef.current = { startMinutes: newStartMinutes, endMinutes: newEndMinutes };

        setSelection(newSelection);
        setIsOverlapping(checkOverlapRef.current(newSelection));
      });
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      const handler = onDoubleClickPropRef.current || onTimeRangeSelectRef.current;

      // シングルタップ検出
      if (!isLongPressActiveRef.current && touchStartPos.current && touchStartTime.current) {
        const touchDuration = Date.now() - touchStartTime.current;
        const touch = e.changedTouches[0];

        if (touch && touchDuration <= DRAG_CONSTANTS.SINGLE_TAP_MAX_DURATION) {
          const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
          const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

          if (
            deltaX <= DRAG_CONSTANTS.LONG_PRESS_MOVE_THRESHOLD &&
            deltaY <= DRAG_CONSTANTS.LONG_PRESS_MOVE_THRESHOLD
          ) {
            if (handler && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const y = touch.clientY - rect.top;
              const tapTime = pixelsToTimeRef.current(y);

              const startTotalMinutes = tapTime.hour * 60 + tapTime.minute;
              const endTotalMinutes = Math.min(
                startTotalMinutes + defaultDurationRef.current,
                24 * 60 - 1,
              );
              const endHour = Math.floor(endTotalMinutes / 60);
              const endMinute = endTotalMinutes % 60;

              const dateTimeSelection: DateTimeSelection = {
                date: dateRef.current,
                startHour: tapTime.hour,
                startMinute: tapTime.minute,
                endHour,
                endMinute,
              };

              tapRef.current();
              handler(dateTimeSelection);
            }
          }
        }

        clearLongPressTimer();
        return;
      }

      if (!isLongPressActiveRef.current) {
        clearLongPressTimer();
        return;
      }

      if (disabledRef.current) {
        clearSelectionState();
        return;
      }

      const sel = selectionRef.current;
      const start = selectionStartRef.current;
      if (sel && start) {
        if (isDragging.current && onTimeRangeSelectRef.current) {
          if (isOverlappingRef.current) {
            clearSelectionState();
            return;
          }

          const dateTimeSelection: DateTimeSelection = {
            date: dateRef.current,
            startHour: sel.startHour,
            startMinute: sel.startMinute,
            endHour: sel.endHour,
            endMinute: sel.endMinute,
          };
          onTimeRangeSelectRef.current(dateTimeSelection);
          setIsSelecting(false);
          setShowSelectionPreview(false);
          isDragging.current = false;
          clearLongPressTimer();
          return;
        } else if (handler) {
          const startTotalMinutes = sel.startHour * 60 + sel.startMinute;
          const endTotalMinutes = Math.min(
            startTotalMinutes + defaultDurationRef.current,
            24 * 60 - 1,
          );
          const endHour = Math.floor(endTotalMinutes / 60);
          const endMinute = endTotalMinutes % 60;

          const dateTimeSelection: DateTimeSelection = {
            date: dateRef.current,
            startHour: sel.startHour,
            startMinute: sel.startMinute,
            endHour,
            endMinute,
          };
          handler(dateTimeSelection);
          setIsSelecting(false);
          setShowSelectionPreview(false);
          isDragging.current = false;
          clearLongPressTimer();
          return;
        }
      }

      clearSelectionState();
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
    // isSelecting のみに依存 — ドラッグ開始/終了時のみリスナー登録/解除
    // ホットパス値（selection, selectionStart, isOverlapping等）は ref 経由で読み取り
  }, [isSelecting, clearSelectionState, clearLongPressTimer, containerRef]);

  // Effect: モーダルキャンセル時のカスタムイベント
  useEffect(() => {
    const handleCalendarDragCancel = () => {
      clearSelectionState();
    };

    window.addEventListener('calendar-drag-cancel', handleCalendarDragCancel);
    return () => window.removeEventListener('calendar-drag-cancel', handleCalendarDragCancel);
  }, [clearSelectionState]);

  // Effect: 外部からの選択範囲表示（サイドバーからの作成時）
  useEffect(() => {
    const handleShowSelection = (e: CustomEvent) => {
      const { date: eventDate, startHour, startMinute, endHour, endMinute } = e.detail;

      const eventDateStr = new Date(eventDate).toDateString();
      const columnDateStr = date.toDateString();

      if (eventDateStr === columnDateStr) {
        setSelection({
          startHour,
          startMinute,
          endHour,
          endMinute,
        });
        setShowSelectionPreview(true);
        setIsOverlapping(false);
      }
    };

    window.addEventListener('calendar-show-selection', handleShowSelection as EventListener);
    return () =>
      window.removeEventListener('calendar-show-selection', handleShowSelection as EventListener);
  }, [date]);

  return {
    isSelecting,
    selection,
    showSelectionPreview,
    isOverlapping,
    handleMouseDown,
    handleDoubleClick,
    handleTouchStart,
  };
}

/**
 * 選択範囲を計算するヘルパー関数
 */
function calculateSelection(
  selectionStart: { hour: number; minute: number },
  currentTime: { hour: number; minute: number },
): TimeRange {
  let startHour, startMinute, endHour, endMinute;

  if (
    currentTime.hour < selectionStart.hour ||
    (currentTime.hour === selectionStart.hour && currentTime.minute < selectionStart.minute)
  ) {
    startHour = currentTime.hour;
    startMinute = currentTime.minute;
    endHour = selectionStart.hour;
    endMinute = selectionStart.minute;
  } else {
    startHour = selectionStart.hour;
    startMinute = selectionStart.minute;
    endHour = currentTime.hour;
    endMinute = currentTime.minute;
  }

  // 最低15分の選択を保証
  if (endHour === startHour && endMinute <= startMinute) {
    endMinute = startMinute + 15;
    if (endMinute >= 60) {
      endHour += 1;
      endMinute = 0;
    }
  }

  return {
    startHour: Math.max(0, startHour),
    startMinute: Math.max(0, startMinute),
    endHour: Math.min(23, endHour),
    endMinute: Math.min(59, endMinute),
  };
}
