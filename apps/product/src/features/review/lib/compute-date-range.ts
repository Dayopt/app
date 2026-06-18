import { addWeeks } from '@/lib/date/core';
import { tzWeekEnd, tzWeekStart } from '@/lib/date/timezone';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';

// ============================================================
// Public API
// ============================================================

/**
 * 基準日から週次 Review の絶対的な日付範囲を算出
 *
 * timezone パラメータを使用してユーザーのローカル深夜をUTCに変換する。
 * これにより非UTCユーザーでも正確な日付境界が保証される。
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function computeStatsDateRange(
  currentDate: Date,
  _granularity: ReviewGranularity,
  timezone: string,
  weekStartsOn: 0 | 1 | 6 = 1,
): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: tzWeekStart(currentDate, timezone, weekStartsOn),
    endDate: tzWeekEnd(currentDate, timezone, weekStartsOn),
  };
}

/**
 * 現在の日付範囲から前週の日付範囲を算出
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function computePreviousDateRange(
  currentDate: Date,
  _granularity: ReviewGranularity,
  timezone: string,
  weekStartsOn: 0 | 1 | 6 = 1,
): {
  startDate: string;
  endDate: string;
} {
  const prev = addWeeks(currentDate, -1);
  return {
    startDate: tzWeekStart(prev, timezone, weekStartsOn),
    endDate: tzWeekEnd(prev, timezone, weekStartsOn),
  };
}

/**
 * 粒度から MonthlyTrend の月数を算出
 */
export function computeMonthCount(_granularity: ReviewGranularity): number {
  return 3;
}
