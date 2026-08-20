/**
 * エントリ日付グループ化統一フック
 */

import { useMemo } from 'react';

import { getDateKey } from '@/lib/date';
import type { CalendarDisplayEvent } from '../../../../types/base.types';
import { isValidEvent } from '../utils/dateHelpers';
import { sortAgendaEventsByDateKeys, sortEventsByDateKeys } from '../utils/timeblockSorting';

/** useTimeblocksByDate フックのオプション */
interface UseEntriesByDateOptions {
  dates: Date[];
  entries: CalendarDisplayEvent[];
  sortType?: 'standard' | 'agenda';
  timezone?: string;
}

/** useTimeblocksByDate フックの戻り値 */
interface UseEntriesByDateReturn {
  entriesByDate: Record<string, CalendarDisplayEvent[]>;
  totalEntries: number;
  hasEntries: boolean;
}

/**
 * エントリを日付ごとにグループ化する統一フック
 *
 * @description
 * 以前は各ビューで80-90行の重複ロジックがあったが、これで統一
 * - WeekView, ThreeDayView, FiveDayView で共通使用
 * - マルチデイエントリ対応
 * - 無効エントリの自動フィルタリング
 * - 時刻ソート
 */
export function useTimeblocksByDate({
  dates,
  entries = [],
  sortType = 'standard',
  timezone,
}: UseEntriesByDateOptions): UseEntriesByDateReturn {
  const entriesByDate = useMemo(() => {
    const grouped: Record<string, CalendarDisplayEvent[]> = {};

    // Step 1: 各日付のキーを初期化
    dates.forEach((date) => {
      const dateKey = getDateKey(date, timezone);
      grouped[dateKey] = [];
    });

    // Step 2: エントリを適切な日付に配置
    entries.forEach((entry) => {
      if (!isValidEvent(entry)) {
        return;
      }

      // startDateがnullまたはundefinedの場合はスキップ
      if (!entry.startDate) {
        return;
      }

      // より柔軟な日付正規化
      const timeblockStart =
        entry.startDate instanceof Date ? entry.startDate : new Date(entry.startDate);

      // 無効な日付は除外
      if (isNaN(timeblockStart.getTime())) {
        return;
      }

      // マルチデイエントリの場合は複数日にまたがって表示
      if (entry.isMultiDay && entry.endDate) {
        const timeblockEnd =
          entry.endDate instanceof Date ? entry.endDate : new Date(entry.endDate);

        if (!isNaN(timeblockEnd.getTime())) {
          const startKey = getDateKey(timeblockStart, timezone);
          const endKey = getDateKey(timeblockEnd, timezone);
          // 期間内の日付のみ処理
          dates.forEach((date) => {
            const dateKey = getDateKey(date, timezone);
            if (dateKey >= startKey && dateKey <= endKey) {
              if (grouped[dateKey]) {
                grouped[dateKey].push(entry);
              }
            }
          });
          return;
        }
      }

      // 単日エントリの場合
      const timeblockDateKey = getDateKey(timeblockStart, timezone);
      dates.forEach((date) => {
        const dateKey = getDateKey(date, timezone);
        if (timeblockDateKey === dateKey) {
          if (grouped[dateKey]) {
            grouped[dateKey].push(entry);
          }
        }
      });
    });

    // Step 3: 各日のエントリを適切にソート
    const sortedResult =
      sortType === 'agenda' ? sortAgendaEventsByDateKeys(grouped) : sortEventsByDateKeys(grouped);

    return sortedResult;
  }, [dates, entries, sortType, timezone]);

  // 統計情報も提供
  const totalEntries = useMemo(() => {
    return Object.values(entriesByDate).reduce((total, dayEntries) => total + dayEntries.length, 0);
  }, [entriesByDate]);

  const hasEntries = totalEntries > 0;

  return {
    entriesByDate,
    totalEntries,
    hasEntries,
  };
}
