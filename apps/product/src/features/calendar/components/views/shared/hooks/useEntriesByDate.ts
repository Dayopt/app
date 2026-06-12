/**
 * エントリ日付グループ化統一フック
 */

import { useMemo } from 'react';

import { isSameDay } from 'date-fns';

import { getDateKey } from '@/lib/date';
import type { CalendarEvent } from '../../../../types/base.types';
import { isValidEvent } from '../utils/dateHelpers';
import { sortAgendaEventsByDateKeys, sortEventsByDateKeys } from '../utils/entrySorting';

/** useEntriesByDate フックのオプション */
interface UseEntriesByDateOptions {
  dates: Date[];
  entries: CalendarEvent[];
  sortType?: 'standard' | 'agenda';
}

/** useEntriesByDate フックの戻り値 */
interface UseEntriesByDateReturn {
  entriesByDate: Record<string, CalendarEvent[]>;
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
export function useEntriesByDate({
  dates,
  entries = [],
  sortType = 'standard',
}: UseEntriesByDateOptions): UseEntriesByDateReturn {
  const entriesByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};

    // Step 1: 各日付のキーを初期化
    dates.forEach((date) => {
      const dateKey = getDateKey(date);
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
      const entryStart =
        entry.startDate instanceof Date ? entry.startDate : new Date(entry.startDate);

      // 無効な日付は除外
      if (isNaN(entryStart.getTime())) {
        return;
      }

      // マルチデイエントリの場合は複数日にまたがって表示
      if (entry.isMultiDay && entry.endDate) {
        const entryEnd = entry.endDate instanceof Date ? entry.endDate : new Date(entry.endDate);

        if (!isNaN(entryEnd.getTime())) {
          // 期間内の日付のみ処理
          dates.forEach((date) => {
            if (date >= entryStart && date <= entryEnd) {
              const dateKey = getDateKey(date);
              if (grouped[dateKey]) {
                grouped[dateKey].push(entry);
              }
            }
          });
          return;
        }
      }

      // 単日エントリの場合
      dates.forEach((date) => {
        if (isSameDay(entryStart, date)) {
          const dateKey = getDateKey(date);
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
  }, [dates, entries, sortType]);

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
