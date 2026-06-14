import { addDays, addWeeks } from '@/lib/date/core';
import { tzDayEnd, tzDayStart, tzWeekEnd, tzWeekStart } from '@/lib/date/timezone';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';

// ============================================================
// Public API
// ============================================================

/**
 * 基準日と粒度から絶対的な日付範囲を算出
 *
 * timezone パラメータを使用してユーザーのローカル深夜をUTCに変換する。
 * これにより非UTCユーザーでも正確な日付境界が保証される。
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function computeStatsDateRange(
  currentDate: Date,
  granularity: ReviewGranularity,
  timezone: string,
  weekStartsOn: 0 | 1 | 6 = 1,
): {
  startDate: string;
  endDate: string;
} {
  switch (granularity) {
    case 'day': {
      return {
        startDate: tzDayStart(currentDate, timezone),
        endDate: tzDayEnd(currentDate, timezone),
      };
    }
    case 'week': {
      return {
        startDate: tzWeekStart(currentDate, timezone, weekStartsOn),
        endDate: tzWeekEnd(currentDate, timezone, weekStartsOn),
      };
    }
  }
}

/**
 * 現在の日付範囲から前期間の日付範囲を算出
 *
 * day → 前日、week → 前週
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function computePreviousDateRange(
  currentDate: Date,
  granularity: ReviewGranularity,
  timezone: string,
  weekStartsOn: 0 | 1 | 6 = 1,
): {
  startDate: string;
  endDate: string;
} {
  switch (granularity) {
    case 'day': {
      const prev = addDays(currentDate, -1);
      return {
        startDate: tzDayStart(prev, timezone),
        endDate: tzDayEnd(prev, timezone),
      };
    }
    case 'week': {
      const prev = addWeeks(currentDate, -1);
      return {
        startDate: tzWeekStart(prev, timezone, weekStartsOn),
        endDate: tzWeekEnd(prev, timezone, weekStartsOn),
      };
    }
  }
}

/**
 * 粒度から MonthlyTrend の月数を算出
 */
export function computeMonthCount(granularity: ReviewGranularity): number {
  switch (granularity) {
    case 'day':
      return 1;
    case 'week':
      return 3;
  }
}
