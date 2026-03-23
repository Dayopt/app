'use client';

/**
 * ドラッグ選択ロジックを管理するカスタムフック（オーケストレーション）
 *
 * 責務をサブフックに分割:
 * - useSelectionEvents: マウス・タッチイベントハンドラー、グローバルイベント管理
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { HOUR_HEIGHT } from '../../constants/grid.constants';

import type { CalendarEvent } from '../../../../../types/calendar.types';
import type { DateTimeSelection, TimeRange } from './types';
import { useSelectionEvents } from './useSelectionEvents';

interface UseDragSelectionOptions {
  date: Date;
  /** この列の日付インデックス（DnDProvider → store 連携用） */
  dayIndex?: number | undefined;
  disabled?: boolean | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  onDoubleClick?: ((selection: DateTimeSelection) => void) | undefined;
  /** 重複チェック用のプラン一覧 */
  plans?: CalendarEvent[] | undefined;
  /** 1時間あたりの高さ（px） */
  hourHeight?: number | undefined;
}

interface UseDragSelectionReturn {
  // State
  isSelecting: boolean;
  selection: TimeRange | null;
  showSelectionPreview: boolean;
  dropTime: string | null;
  isOver: boolean;
  /** 選択範囲が既存プランと重複しているか */
  isOverlapping: boolean;

  // Refs
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Handlers
  handleMouseDown: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;

  // Utilities
  formatTime: (hour: number, minute: number) => string;
  droppableId: string;
  droppableData: { date: Date; time: string | null; dayIndex: number };
}

/**
 * カレンダードラッグ選択のロジックを管理
 */
export function useDragSelection({
  date,
  dayIndex = 0,
  disabled = false,
  onTimeRangeSelect,
  onDoubleClick: onDoubleClickProp,
  plans: _plans = [],
  hourHeight = HOUR_HEIGHT,
}: UseDragSelectionOptions): UseDragSelectionReturn {
  // 設定からデフォルト時間を取得
  const defaultDuration = useCalendarSettingsStore((state) => state.defaultDuration);

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drop state
  // dropTimeRef: pointermoveで同期的に更新（RAF待ちなし）→ dnd-kitがドロップ時に即座に最新値を取得
  const dropTimeRef = useRef<string | null>(null);
  const [dropTime, setDropTime] = useState<string | null>(null);
  const [isOver, setIsOver] = useState(false);

  // 重複チェック関数（無効化済み）
  const checkOverlap = useCallback((_sel: TimeRange): boolean => {
    return false;
  }, []);

  // Droppable ID and data
  // getter で常に最新の ref 値を返す（React state の遅延を回避）
  const droppableId = `calendar-droppable-${format(date, 'yyyy-MM-dd')}`;
  const droppableData = {
    date,
    get time() {
      return dropTimeRef.current;
    },
    dayIndex,
  };

  // Helper: 時間をフォーマット
  const formatTime = useCallback((hour: number, minute: number): string => {
    const h = hour.toString().padStart(2, '0');
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m}`;
  }, []);

  // Helper: 座標から時間を計算
  const pixelsToTime = useCallback(
    (y: number) => {
      const totalMinutes = (y / hourHeight) * 60;
      let minute = Math.round((totalMinutes % 60) / 15) * 15;
      let hour = Math.floor(totalMinutes / 60);

      // 四捨五入で60分に繰り上がった場合
      if (minute >= 60) {
        minute = 0;
        hour += 1;
      }

      if (hour >= 24) {
        return { hour: 23, minute: 45 };
      }

      return { hour: Math.max(0, hour), minute: Math.max(0, minute) };
    },
    [hourHeight],
  );

  // --- サブフック: イベントハンドラー ---
  const {
    isSelecting,
    selection,
    showSelectionPreview,
    isOverlapping,
    handleMouseDown,
    handleDoubleClick,
    handleTouchStart,
  } = useSelectionEvents({
    date,
    disabled,
    defaultDuration,
    containerRef,
    onTimeRangeSelect,
    onDoubleClick: onDoubleClickProp,
    pixelsToTime,
    checkOverlap,
  });

  // Effect: ポインタムーブ時にドロップ時刻を更新（rAFスロットル）
  // pointermove は mouse + touch 統一で、タッチドラッグにも対応
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;

      if (y >= 0 && y <= rect.height) {
        const time = pixelsToTime(y);
        const timeString = formatTime(time.hour, time.minute);
        // ref を同期的に更新 → dnd-kit の droppableData.time getter が即座に最新値を返す
        dropTimeRef.current = timeString;
        // state は描画用（RAF スロットル）
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            setDropTime(dropTimeRef.current);
            setIsOver(true);
          });
        }
      } else {
        dropTimeRef.current = null;
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            setDropTime(null);
            setIsOver(false);
          });
        }
      }
    };

    const handlePointerLeave = () => {
      dropTimeRef.current = null;
      setDropTime(null);
      setIsOver(false);
    };

    containerRef.current.addEventListener('pointermove', handlePointerMove);
    containerRef.current.addEventListener('pointerleave', handlePointerLeave);
    const ref = containerRef.current;

    return () => {
      ref?.removeEventListener('pointermove', handlePointerMove);
      ref?.removeEventListener('pointerleave', handlePointerLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [pixelsToTime, formatTime]);

  return {
    isSelecting,
    selection,
    showSelectionPreview,
    dropTime,
    isOver,
    isOverlapping,
    containerRef,
    handleMouseDown,
    handleDoubleClick,
    handleTouchStart,
    formatTime,
    droppableId,
    droppableData,
  };
}
