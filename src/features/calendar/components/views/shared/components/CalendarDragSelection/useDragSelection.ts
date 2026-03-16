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
  droppableData: { date: Date; time: string | null };
}

/**
 * カレンダードラッグ選択のロジックを管理
 */
export function useDragSelection({
  date,
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
  const [dropTime, setDropTime] = useState<string | null>(null);
  const [isOver, setIsOver] = useState(false);

  // 重複チェック関数（無効化済み）
  const checkOverlap = useCallback((_sel: TimeRange): boolean => {
    return false;
  }, []);

  // Droppable ID and data
  const droppableId = `calendar-droppable-${format(date, 'yyyy-MM-dd')}`;
  const droppableData = { date, time: dropTime };

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
      const hour = Math.floor(totalMinutes / 60);
      const minute = Math.floor((totalMinutes % 60) / 15) * 15;

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

  // Effect: マウスムーブ時にドロップ時刻を更新（rAFスロットル）
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;

        if (y >= 0 && y <= rect.height) {
          const time = pixelsToTime(y);
          const timeString = formatTime(time.hour, time.minute);
          setDropTime(timeString);
          setIsOver(true);
        } else {
          setDropTime(null);
          setIsOver(false);
        }
      });
    };

    containerRef.current.addEventListener('mousemove', handleMouseMove);
    const ref = containerRef.current;

    return () => {
      ref?.removeEventListener('mousemove', handleMouseMove);
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
