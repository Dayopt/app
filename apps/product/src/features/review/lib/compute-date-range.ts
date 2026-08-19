import { eachDayOfInterval, endOfWeek, startOfWeek } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

import { addWeeks } from '@/lib/date/core';
import { tzWeekEnd, tzWeekStart } from '@/lib/date/timezone';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';

/** `/report` の期間契約（`?date=&range=`）から `days` をクライアント側でのみ組み立てる。
 *
 * サーバー prefetch はしない（overview.md §6-9 #3）。`toCalendarDateKey`（本ファイル内）が
 * ローカル TZ の getter に依存するため、サーバー（UTC）で組むと非 UTC ユーザーの週境界がずれる。
 * `showWeekends` / `weekStartsOn` は URL に載せない（共有リンクの相手は自分の設定で見る、
 * overview.md §6-9 #5）。
 */
export function buildReportDisplayRange(
  date: Date,
  range: ReviewGranularity,
  showWeekends: boolean,
  weekStartsOn: 0 | 1 | 6 = 1,
): ReviewDisplayRange {
  if (range === 'day') {
    return { start: date, end: date, days: [date], showWeekends };
  }

  const weekStart = startOfWeek(date, { weekStartsOn });
  const weekEnd = endOfWeek(date, { weekStartsOn });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const days = showWeekends
    ? weekDays
    : weekDays.filter((day) => day.getDay() !== 0 && day.getDay() !== 6);

  return {
    start: days[0] ?? weekStart,
    end: days[days.length - 1] ?? weekEnd,
    days,
    showWeekends,
  };
}

export interface ReviewDisplayRange {
  start: Date;
  end: Date;
  days: readonly Date[];
  showWeekends: boolean;
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
 * current / previous とも実際の表示日キーを返す。前期間は表示日数と同じ日数を
 * 直前へずらし、週末非表示時は土日を飛ばす。
 */
export function computeCalendarDisplayDateRanges(
  displayRange: ReviewDisplayRange,
  timezone: string,
): {
  dateRange: ReviewDateRange;
  prevDateRange: ReviewDateRange;
  dayCount: number;
  visibleDateKeys: string[];
  prevVisibleDateKeys: string[];
} {
  const visibleDateKeys = Array.from(
    new Set(
      (displayRange.days.length > 0 ? displayRange.days : [displayRange.start]).map(
        toCalendarDateKey,
      ),
    ),
  ).sort();
  const startDateKey = visibleDateKeys[0] ?? toCalendarDateKey(displayRange.start);
  const endDateKey = visibleDateKeys[visibleDateKeys.length - 1] ?? startDateKey;
  const dayCount = visibleDateKeys.length;
  const prevVisibleDateKeys = getPreviousVisibleDateKeys(
    startDateKey,
    dayCount,
    displayRange.showWeekends,
  );
  const prevStartDateKey = prevVisibleDateKeys[0] ?? shiftDateKey(startDateKey, -1);
  const prevEndDateKey = prevVisibleDateKeys[prevVisibleDateKeys.length - 1] ?? prevStartDateKey;

  return {
    dateRange: toDateRange(startDateKey, endDateKey, timezone),
    prevDateRange: toDateRange(prevStartDateKey, prevEndDateKey, timezone),
    dayCount,
    visibleDateKeys,
    prevVisibleDateKeys,
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

function shiftDateKey(dateKey: string, dayDelta: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

function getPreviousVisibleDateKeys(
  startDateKey: string,
  dayCount: number,
  showWeekends: boolean,
): string[] {
  const dateKeys: string[] = [];
  let candidate = shiftDateKey(startDateKey, -1);

  while (dateKeys.length < dayCount) {
    if (showWeekends || !isWeekendDateKey(candidate)) {
      dateKeys.unshift(candidate);
    }
    candidate = shiftDateKey(candidate, -1);
  }

  return dateKeys;
}

function isWeekendDateKey(dateKey: string): boolean {
  const dayOfWeek = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function toCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
