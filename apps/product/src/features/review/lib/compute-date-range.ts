import { fromZonedTime } from 'date-fns-tz';

import { addWeeks } from '@/lib/date/core';
import { tzWeekEnd, tzWeekStart } from '@/lib/date/timezone';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReviewDisplayRange {
  start: Date;
  end: Date;
}

interface ReviewDateRange {
  startDate: string;
  endDate: string;
}

// ============================================================
// Public API
// ============================================================

/**
 * Calendar の表示日付を、ユーザー timezone の日境界へ変換する。
 *
 * displayRange の Date は Calendar が描画するローカル日付なので、時刻として再解釈せず
 * 年月日の成分をそのまま使う。
 *
 * 前期間は表示日数と同じ日数を直前へずらす。ミリ秒差ではなく日付をずらすことで、
 * DST をまたいでも同じ数のローカル日を比較対象にする。
 */
export function computeCalendarDisplayDateRanges(
  displayRange: ReviewDisplayRange,
  timezone: string,
): {
  dateRange: ReviewDateRange;
  prevDateRange: ReviewDateRange;
  dayCount: number;
} {
  const startDateKey = toCalendarDateKey(displayRange.start);
  const endDateKey = toCalendarDateKey(displayRange.end);
  const dayCount = getInclusiveDayCount(startDateKey, endDateKey);
  const prevStartDateKey = shiftDateKey(startDateKey, -dayCount);
  const prevEndDateKey = shiftDateKey(startDateKey, -1);

  return {
    dateRange: toDateRange(startDateKey, endDateKey, timezone),
    prevDateRange: toDateRange(prevStartDateKey, prevEndDateKey, timezone),
    dayCount,
  };
}

/** Calendar から同期的に渡された基準日を優先し、range と year の query 世代を揃える。 */
export function resolveReviewQueryYear(calendarDate: Date | undefined, fallbackDate: Date): number {
  return (calendarDate ?? fallbackDate).getFullYear();
}

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

function toDateRange(startDateKey: string, endDateKey: string, timezone: string): ReviewDateRange {
  return {
    startDate: fromZonedTime(`${startDateKey}T00:00:00.000`, timezone).toISOString(),
    endDate: fromZonedTime(`${endDateKey}T23:59:59.999`, timezone).toISOString(),
  };
}

function getInclusiveDayCount(startDateKey: string, endDateKey: string): number {
  const start = Date.parse(`${startDateKey}T00:00:00.000Z`);
  const end = Date.parse(`${endDateKey}T00:00:00.000Z`);
  return Math.max(1, Math.round((end - start) / MILLISECONDS_PER_DAY) + 1);
}

function shiftDateKey(dateKey: string, dayDelta: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

function toCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
