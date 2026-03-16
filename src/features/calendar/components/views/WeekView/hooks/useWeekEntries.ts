import { useMemo } from 'react';

import { isSameDay } from 'date-fns';

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
 * - エントリの重なり検出
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

  // エントリの位置情報を計算
  const entryPositions = useMemo(() => {
    const positions: WeekEntryPosition[] = [];

    const dayColumnWidth = weekDates.length > 0 ? 100 / weekDates.length : 100;

    weekDates.forEach((date, dayIndex) => {
      const dateKey = getDateKey(date);
      const dayEntries =
        (Object.prototype.hasOwnProperty.call(entriesByDate, dateKey)
          ? entriesByDate[dateKey]
          : null) || [];

      // その日のエントリの重なりを検出
      const entryColumns = calculateEntryColumns(dayEntries);

      dayEntries.forEach((entry, entryIndex) => {
        if (!entry.displayStartDate) return;

        // 時刻からピクセル位置を計算（displayStartDateでTZ対応）
        const startHour = entry.displayStartDate.getHours();
        const startMinute = entry.displayStartDate.getMinutes();
        const top = (startHour + startMinute / 60) * hourHeight;

        // 終了時刻から高さを計算
        let height = hourHeight; // デフォルト1時間
        if (entry.displayEndDate) {
          const endHour = entry.displayEndDate.getHours();
          const endMinute = entry.displayEndDate.getMinutes();
          const duration = endHour + endMinute / 60 - (startHour + startMinute / 60);
          height = Math.max(20, duration * hourHeight); // 最小20px
        }

        // 重なりがある場合の列計算
        const columnInfo = entryColumns[entryIndex] ?? { column: 0, totalColumns: 1 };
        const columnWidth = dayColumnWidth / columnInfo.totalColumns;
        const left = dayIndex * dayColumnWidth + columnInfo.column * columnWidth;
        const width = columnWidth * 0.95; // 少し余白を作る

        positions.push({
          plan: entry,
          dayIndex,
          top,
          height,
          left,
          width,
          zIndex: 20 + columnInfo.column,
          column: columnInfo.column,
          totalColumns: columnInfo.totalColumns,
        });
      });
    });

    return positions;
  }, [weekDates, entriesByDate, hourHeight]);

  // 最大同時エントリ数を計算（sweep-line O(n log n)）
  const maxConcurrentEntries = useMemo(() => {
    let maxConcurrent = 0;

    Object.values(entriesByDate).forEach((dayEntries) => {
      if (dayEntries.length <= 1) return;

      // sweep-line: 開始/終了イベントを時刻順に処理
      const timePoints: { time: number; type: 'start' | 'end' }[] = [];

      dayEntries.forEach((entry) => {
        if (!entry.displayStartDate) return;

        const start = entry.displayStartDate.getHours() + entry.displayStartDate.getMinutes() / 60;
        const end = entry.displayEndDate
          ? entry.displayEndDate.getHours() + entry.displayEndDate.getMinutes() / 60
          : start + 1;

        timePoints.push({ time: start, type: 'start' });
        timePoints.push({ time: end, type: 'end' });
      });

      timePoints.sort((a, b) => {
        const timeDiff = a.time - b.time;
        if (timeDiff !== 0) return timeDiff;
        // 同時刻の場合、endを先に処理
        return a.type === 'end' ? -1 : 1;
      });

      let current = 0;
      timePoints.forEach((point) => {
        if (point.type === 'start') {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
        } else {
          current--;
        }
      });
    });

    return maxConcurrent;
  }, [entriesByDate]);

  return {
    entriesByDate,
    entryPositions,
    maxConcurrentEntries,
  };
}

/**
 * エントリの重なりを検出して列配置を計算
 */
function calculateEntryColumns(
  entries: CalendarEvent[],
): Array<{ column: number; totalColumns: number }> {
  if (entries.length === 0) return [];

  // 時間順にソート済みと仮定
  const columns: Array<{ column: number; totalColumns: number }> = [];
  const occupiedColumns: Array<{ end: number }> = [];

  entries.forEach((entry) => {
    if (!entry.displayStartDate) {
      columns.push({ column: 0, totalColumns: 1 });
      return;
    }

    const start = entry.displayStartDate.getHours() + entry.displayStartDate.getMinutes() / 60;
    const end = entry.displayEndDate
      ? entry.displayEndDate.getHours() + entry.displayEndDate.getMinutes() / 60
      : start + 1;

    // 利用可能な列を探す
    let columnIndex = 0;
    while (columnIndex < occupiedColumns.length) {
      const col = occupiedColumns[columnIndex];
      if (!col || col.end <= start) break;
      columnIndex++;
    }

    // 列を占有
    if (columnIndex >= occupiedColumns.length) {
      occupiedColumns.push({ end });
    } else {
      const col = occupiedColumns[columnIndex];
      if (col) {
        col.end = end;
      }
    }

    columns.push({
      column: columnIndex,
      totalColumns: Math.max(occupiedColumns.length, 1),
    });
  });

  // すべてのエントリの totalColumns を統一
  const maxColumns = Math.max(...columns.map((col) => col.totalColumns), 1);
  return columns.map((col) => ({
    ...col,
    totalColumns: maxColumns,
  }));
}
