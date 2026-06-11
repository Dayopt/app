import { useMemo } from 'react';

import { isSameDay, isValid } from 'date-fns';

import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import { applyTimezoneToDisplayDates } from '../../../../lib/plan-data-adapter';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { HOUR_HEIGHT } from '../constants/grid.constants';
import { getEntryStackIndex } from '../utils/entryStacking';

import { useEntryLayoutCalculator, type EntryLayout } from './useEntryLayoutCalculator';

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
    const result = tzEntries.filter((entry) => {
      if (!entry.displayStartDate || !isValid(new Date(entry.displayStartDate))) {
        return false;
      }

      return isSameDay(entry.displayStartDate, date);
    });

    return result;
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
        zIndex: getEntryStackIndex(layout.entry as CalendarEvent, index),
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
