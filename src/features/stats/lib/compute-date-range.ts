import { formatInTimeZone } from 'date-fns-tz';

import { addDays, addMonths, addWeeks } from '@/lib/date/core';
import {
  tzDayEnd,
  tzDayStart,
  tzMonthEnd,
  tzMonthStart,
  tzWeekEnd,
  tzWeekStart,
} from '@/lib/date/timezone';

import type { StatsGranularity } from '../stores/useStatsFilterStore';

// ============================================================
// Internal helpers
// ============================================================

/**
 * 指定タイムゾーンで date が属する年を返す
 */
function getYearInTimezone(date: Date, timezone: string): number {
  return parseInt(formatInTimeZone(date, timezone, 'yyyy'), 10);
}

/**
 * 年の開始（1/1 00:00:00）をUTC ISOで返す
 */
function tzYearStart(year: number, timezone: string): string {
  return tzDayStart(new Date(`${year}-01-01T12:00:00Z`), timezone);
}

/**
 * 年の終了（12/31 23:59:59.999）をUTC ISOで返す
 */
function tzYearEnd(year: number, timezone: string): string {
  return tzDayEnd(new Date(`${year}-12-31T12:00:00Z`), timezone);
}

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
  granularity: StatsGranularity,
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
    case 'month': {
      return {
        startDate: tzMonthStart(currentDate, timezone),
        endDate: tzMonthEnd(currentDate, timezone),
      };
    }
    case 'year': {
      const year = getYearInTimezone(currentDate, timezone);
      return {
        startDate: tzYearStart(year, timezone),
        endDate: tzYearEnd(year, timezone),
      };
    }
  }
}

/**
 * 現在の日付範囲から前期間の日付範囲を算出
 *
 * day → 前日、week → 前週、month → 前月、year → 前年
 *
 * weekStartsOn はユーザーの週開始曜日設定（0=日, 1=月, 6=土）。
 * 省略時はデフォルト 1（月曜始まり）。
 */
export function computePreviousDateRange(
  currentDate: Date,
  granularity: StatsGranularity,
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
    case 'month': {
      const prev = addMonths(currentDate, -1);
      return {
        startDate: tzMonthStart(prev, timezone),
        endDate: tzMonthEnd(prev, timezone),
      };
    }
    case 'year': {
      const year = getYearInTimezone(currentDate, timezone) - 1;
      return {
        startDate: tzYearStart(year, timezone),
        endDate: tzYearEnd(year, timezone),
      };
    }
  }
}

/**
 * 粒度から MonthlyTrend の月数を算出
 */
export function computeMonthCount(granularity: StatsGranularity): number | undefined {
  switch (granularity) {
    case 'day':
      return 1;
    case 'week':
      return 3;
    case 'month':
      return 12;
    case 'year':
      return undefined;
  }
}
