import { useMemo } from 'react';

import { format, isSameDay, isValid } from 'date-fns';

import { applyTimezoneToDisplayDates } from '../../../../lib/plan-data-adapter';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { HOUR_HEIGHT as DEFAULT_HOUR_HEIGHT } from '../constants/grid.constants';

import { useEntryLayoutCalculator, type EntryLayout } from './useEntryLayoutCalculator';
import type { EntryPosition } from './useViewEntries';

const ENTRY_PADDING = 2; // エントリ間のパディング
const MIN_ENTRY_HEIGHT = 20; // 最小エントリ高さ

/** useMultiDayEntryPositions フックのオプション */
interface UseMultiDayEntryPositionsOptions {
  displayDates: Date[];
  entries: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

/** useMultiDayEntryPositions フックの戻り値 */
interface UseMultiDayEntryPositionsReturn {
  entryPositions: EntryPosition[];
  entriesByDate: Map<string, CalendarEvent[]>;
}

/**
 * 複数日表示用のエントリ位置計算フック
 * MultiDayView(3day/5day等)で共通利用
 *
 * useEntryLayoutCalculatorを使用して重複エントリの
 * カラム配置を正しく計算
 */
export function useMultiDayEntryPositions({
  displayDates,
  entries,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  timezone,
}: UseMultiDayEntryPositionsOptions): UseMultiDayEntryPositionsReturn {
  // TZ変換を適用（Planのみ、Recordは変換しない）
  const tzEntries = useMemo(
    () => entries.map((p) => applyTimezoneToDisplayDates(p, timezone)),
    [entries, timezone],
  );

  // 日付別にエントリをグループ化（displayStartDateで判定）
  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();

    displayDates.forEach((date) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const dayEntries = tzEntries.filter((entry) => {
        if (!entry.displayStartDate || !isValid(new Date(entry.displayStartDate))) {
          return false;
        }
        return isSameDay(entry.displayStartDate, date);
      });
      grouped.set(dateKey, dayEntries);
    });

    return grouped;
  }, [displayDates, tzEntries]);

  // 全日付のエントリをTimedEntry形式に変換（useEntryLayoutCalculator用）
  // displayStartDate/displayEndDateを使用してTZ対応の位置計算を実現
  const allConvertedEntries = useMemo(() => {
    const converted: Array<{
      dateKey: string;
      entry: CalendarEvent;
      start: Date;
      end: Date;
      id: string;
    }> = [];

    entriesByDate.forEach((dayEntries, dateKey) => {
      dayEntries.forEach((entry) => {
        converted.push({
          dateKey,
          entry,
          start: entry.displayStartDate,
          end: entry.displayEndDate || new Date(entry.displayStartDate.getTime() + 60 * 60 * 1000),
          id: entry.id,
        });
      });
    });

    return converted;
  }, [entriesByDate]);

  // 日付ごとにレイアウト計算
  // useEntryLayoutCalculatorはフックなので、日付ごとに呼べない
  // 代わりに全エントリを一度に渡し、後で日付ごとに分離
  const entryLayouts = useEntryLayoutCalculator(
    allConvertedEntries.map((p) => ({
      ...p.entry,
      start: p.start,
      end: p.end,
      id: p.id,
    })),
  );

  // レイアウト情報をEntryPositionに変換
  const entryPositions = useMemo((): EntryPosition[] => {
    return entryLayouts.map((layout: EntryLayout, index: number) => {
      const originalEntry = allConvertedEntries.find((p) => p.id === layout.entry.id);
      const entry = originalEntry?.entry || (layout.entry as CalendarEvent);

      const startDate = new Date(layout.entry.start);
      const endDate = new Date(layout.entry.end);

      const startHour = startDate.getHours() + startDate.getMinutes() / 60;
      const endHour = endDate.getHours() + endDate.getMinutes() / 60;
      const duration = Math.max(endHour - startHour, 0.25); // 最小15分

      // 位置計算
      const top = startHour * hourHeight;
      const height = Math.max(duration * hourHeight - ENTRY_PADDING, MIN_ENTRY_HEIGHT);

      return {
        plan: entry,
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
  }, [entryLayouts, allConvertedEntries, hourHeight]);

  return {
    entryPositions,
    entriesByDate,
  };
}
