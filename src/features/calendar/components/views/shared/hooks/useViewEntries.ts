import { useMemo } from 'react';

import { isSameDay, isValid } from 'date-fns';

import { applyTimezoneToDisplayDates } from '../../../../lib/plan-data-adapter';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { HOUR_HEIGHT } from '../constants/grid.constants';

import { useEntryLayoutCalculator, type EntryLayout } from './useEntryLayoutCalculator';

const ENTRY_PADDING = 2; // エントリ間のパディング
const MIN_ENTRY_HEIGHT = 20; // 最小エントリ高さ

interface UseViewEntriesOptions {
  date: Date;
  entries: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

/** グリッド上のエントリ描画位置情報 */
export interface EntryPosition {
  plan: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  column: number;
  totalColumns: number;
  opacity?: number;
}

interface UseViewEntriesReturn {
  dayEntries: CalendarEvent[];
  entryPositions: EntryPosition[];
  maxConcurrentEntries: number;
  skippedEntriesCount: number;
}

/**
 * 汎用的なビューエントリ処理フック
 * DayView, WeekView等で共通利用可能
 */
/** 指定日のエントリをフィルタ・配置計算するフック（DayView/WeekView等で共通利用） */
export function useViewEntries({
  date,
  entries = [],
  hourHeight = HOUR_HEIGHT,
  timezone,
}: UseViewEntriesOptions): UseViewEntriesReturn {
  // TZ変換を適用（Planのみ、Recordは変換しない）
  const tzEntries = useMemo(
    () => entries.map((p) => applyTimezoneToDisplayDates(p, timezone)),
    [entries, timezone],
  );

  // 指定日のエントリのみフィルター（displayStartDateで判定）
  const dayEntries = useMemo(() => {
    if (!tzEntries || !Array.isArray(tzEntries)) {
      return [];
    }
    return tzEntries.filter((entry) => {
      if (!entry.displayStartDate || !isValid(new Date(entry.displayStartDate))) {
        return false;
      }

      return isSameDay(entry.displayStartDate, date);
    });
  }, [date, tzEntries]);

  // CalendarEventをuseEntryLayoutCalculatorで期待される形式に変換
  // displayStartDate/displayEndDateを使用してTZ対応の位置計算を実現
  const convertedEntries = useMemo(() => {
    return dayEntries.map((entry) => ({
      ...entry,
      start: entry.displayStartDate,
      end: entry.displayEndDate || new Date(entry.displayStartDate.getTime() + 60 * 60 * 1000),
    }));
  }, [dayEntries]);

  // 新しいレイアウト計算システムを使用
  const entryLayouts = useEntryLayoutCalculator(convertedEntries);

  // レイアウト情報をEntryPositionに変換
  const entryPositions = useMemo((): EntryPosition[] => {
    return entryLayouts.map((layout: EntryLayout, index: number) => {
      const startDate = new Date(layout.entry.start);
      const endDate = new Date(layout.entry.end);

      const startHour = startDate.getHours() + startDate.getMinutes() / 60;
      const endHour = endDate.getHours() + endDate.getMinutes() / 60;
      const duration = Math.max(endHour - startHour, 0.25); // 最小15分

      // 位置計算
      const top = startHour * hourHeight;
      const height = Math.max(duration * hourHeight - ENTRY_PADDING, MIN_ENTRY_HEIGHT);

      return {
        plan: layout.entry as CalendarEvent,
        top,
        height,
        left: layout.left,
        width: layout.width,
        zIndex: 10 + index,
        column: layout.column,
        totalColumns: layout.totalColumns,
        opacity: layout.totalColumns > 1 ? 0.95 : 1.0,
      };
    });
  }, [entryLayouts, hourHeight]);

  const maxConcurrentEntries = useMemo(() => {
    return Math.max(1, ...entryLayouts.map((layout: EntryLayout) => layout.totalColumns));
  }, [entryLayouts]);

  return {
    dayEntries,
    entryPositions,
    maxConcurrentEntries,
    skippedEntriesCount: 0, // 新しいシステムではスキップしない
  };
}
