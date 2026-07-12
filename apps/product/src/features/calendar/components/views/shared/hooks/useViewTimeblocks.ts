import { useMemo } from 'react';

import { isValid } from 'date-fns';

import { getDateKey } from '@/lib/date';
import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { HOUR_HEIGHT } from '../constants/grid.constants';
import { getTimeblockStackIndex } from '../utils/timeblockStacking';

import { useTimeblockLayoutCalculator, type TimeblockLayout } from './useTimeblockLayoutCalculator';

interface UseViewEntriesOptions {
  date: Date;
  entries: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

/** グリッド上のエントリ描画位置情報 */
export interface TimeblockPosition {
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
  entryPositions: TimeblockPosition[];
  maxConcurrentEntries: number;
  skippedEntriesCount: number;
}

/**
 * 汎用的なビューエントリ処理フック
 * DayView, WeekView等で共通利用可能
 */
/** 指定日のエントリをフィルタ・配置計算するフック（DayView/WeekView等で共通利用） */
export function useViewTimeblocks({
  date,
  entries = [],
  hourHeight = HOUR_HEIGHT,
  timezone,
}: UseViewEntriesOptions): UseViewEntriesReturn {
  // 指定日のエントリのみフィルター（raw startDate + ユーザーTZの日付キーで判定）
  const dayEntries = useMemo(() => {
    if (!entries || !Array.isArray(entries)) {
      return [];
    }
    const dateKey = getDateKey(date, timezone);
    const result = entries.filter((entry) => {
      if (
        !entry.startDate ||
        !entry.displayStartDate ||
        !isValid(new Date(entry.displayStartDate))
      ) {
        return false;
      }

      return getDateKey(entry.startDate, timezone) === dateKey;
    });

    return result;
  }, [date, entries, timezone]);

  // CalendarEventをuseTimeblockLayoutCalculatorで期待される形式に変換
  // displayStartDate/displayEndDateを使用してTZ対応の位置計算を実現
  const convertedEntries = useMemo(() => {
    return dayEntries.map((entry) => ({
      ...entry,
      start: entry.displayStartDate,
      end: entry.displayEndDate || new Date(entry.displayStartDate.getTime() + 60 * 60 * 1000),
    }));
  }, [dayEntries]);

  // 新しいレイアウト計算システムを使用
  const entryLayouts = useTimeblockLayoutCalculator(convertedEntries);

  // レイアウト情報をTimeblockPositionに変換
  const entryPositions = useMemo((): TimeblockPosition[] => {
    return entryLayouts.map((layout: TimeblockLayout, index: number) => {
      const { top, height } = layoutEntryToVerticalPosition(
        new Date(layout.entry.start),
        new Date(layout.entry.end),
        hourHeight,
      );

      return {
        plan: layout.entry as CalendarEvent,
        top,
        height,
        left: layout.left,
        width: layout.width,
        zIndex: getTimeblockStackIndex(layout.entry as CalendarEvent, index),
        column: layout.column,
        totalColumns: layout.totalColumns,
        opacity: layout.totalColumns > 1 ? 0.95 : 1.0,
      };
    });
  }, [entryLayouts, hourHeight]);

  const maxConcurrentEntries = useMemo(() => {
    return Math.max(1, ...entryLayouts.map((layout: TimeblockLayout) => layout.totalColumns));
  }, [entryLayouts]);

  return {
    dayEntries,
    entryPositions,
    maxConcurrentEntries,
    skippedEntriesCount: 0, // 新しいシステムではスキップしない
  };
}
