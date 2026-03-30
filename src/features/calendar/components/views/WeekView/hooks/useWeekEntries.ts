import { useMemo } from 'react';

import { isSameDay } from 'date-fns';

import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import { calculateEntryLayouts, type EntryLayout } from '../../../../lib/layout';
import { applyTimezoneToDisplayDates } from '../../../../lib/plan-data-adapter';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { getDateKey, isValidEvent, sortEventsByDateKeys } from '../../shared';
import { HOUR_HEIGHT } from '../../shared/constants/grid.constants';
import type {
  UseWeekEntriesOptions,
  UseWeekEntriesReturn,
  WeekEntryPosition,
} from '../WeekView.types';

/**
 * 週ビューでのエントリ位置計算専用フック
 *
 * @description
 * - エントリの重なり検出（共有layoutエンジン使用）
 * - 位置とサイズの計算
 * - 最大同時エントリ数の算出
 */
export function useWeekEntries({
  weekDates,
  events: entries = [],
  hourHeight = HOUR_HEIGHT,
  timezone,
}: UseWeekEntriesOptions): UseWeekEntriesReturn {
  // TZ変換を適用
  const tzEntries = useMemo(
    () => entries.map((p) => applyTimezoneToDisplayDates(p, timezone)),
    [entries, timezone],
  );

  // エントリを日付ごとにグループ化（displayStartDateで判定）
  const entriesByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};

    // 各日付のキーを初期化
    weekDates.forEach((date) => {
      const dateKey = getDateKey(date);
      if (!(dateKey in grouped)) {
        grouped[dateKey] = [];
      }
    });

    // エントリを適切な日付に配置
    tzEntries.forEach((entry) => {
      if (!isValidEvent(entry)) return;

      if (!entry.displayStartDate) return;

      const entryStart =
        entry.displayStartDate instanceof Date
          ? entry.displayStartDate
          : new Date(entry.displayStartDate);

      // 無効な日付は除外
      if (isNaN(entryStart.getTime())) return;

      // 週の範囲内の日付を確認
      weekDates.forEach((date) => {
        if (isSameDay(entryStart, date)) {
          const dateKey = getDateKey(date);
          if (Object.prototype.hasOwnProperty.call(grouped, dateKey) && grouped[dateKey]) {
            grouped[dateKey].push(entry);
          }
        }
      });
    });

    // 各日のエントリを時刻順にソート
    return sortEventsByDateKeys(grouped);
  }, [weekDates, tzEntries]);

  // エントリの位置情報を計算（共有layoutエンジン使用）
  const entryPositions = useMemo(() => {
    const positions: WeekEntryPosition[] = [];

    const dayColumnWidth = weekDates.length > 0 ? 100 / weekDates.length : 100;

    weekDates.forEach((date, dayIndex) => {
      const dateKey = getDateKey(date);
      const dayEntries =
        (Object.prototype.hasOwnProperty.call(entriesByDate, dateKey)
          ? entriesByDate[dateKey]
          : null) || [];

      // CalendarEventをTimedEntry形式に変換（calculateEntryLayouts用）
      const timedEntries = dayEntries
        .filter((entry) => !!entry.displayStartDate)
        .map((entry) => ({
          ...entry,
          start: entry.displayStartDate,
          end: entry.displayEndDate || new Date(entry.displayStartDate.getTime() + 60 * 60 * 1000),
        }));

      // 共有layoutエンジンでカラム配置を計算
      const layouts = calculateEntryLayouts(timedEntries);

      // EntryLayoutをWeekEntryPositionに変換
      layouts.forEach((layout: EntryLayout, index: number) => {
        const entry = layout.entry as CalendarEvent;
        const { top, height } = layoutEntryToVerticalPosition(
          new Date(layout.entry.start),
          new Date(layout.entry.end),
          hourHeight,
        );

        // 日列内でのleft/widthを計算（dayColumnWidth内でlayout.left/widthを適用）
        const columnWidth = dayColumnWidth / layout.totalColumns;
        const left = dayIndex * dayColumnWidth + layout.column * columnWidth;
        const width = columnWidth * 0.95; // 少し余白を作る

        positions.push({
          plan: entry,
          dayIndex,
          top,
          height,
          left,
          width,
          zIndex: 20 + index,
          column: layout.column,
          totalColumns: layout.totalColumns,
        });
      });
    });

    return positions;
  }, [weekDates, entriesByDate, hourHeight]);

  // 最大同時エントリ数を計算（layoutエンジンの結果から導出）
  const maxConcurrentEntries = useMemo(() => {
    if (entryPositions.length === 0) return 0;
    return Math.max(0, ...entryPositions.map((pos) => pos.totalColumns));
  }, [entryPositions]);

  return {
    entriesByDate,
    entryPositions,
    maxConcurrentEntries,
  };
}
