import { fromZonedTime } from 'date-fns-tz';

import { addDays, addMonths, addWeeks } from '@/lib/date/core';

import type { StatsGranularity } from '../stores/useStatsFilterStore';

// ============================================================
// TZ-aware boundary helpers
// ============================================================

/**
 * 指定タイムゾーンにおける日付の "YYYY-MM-DD" 文字列を返す
 */
function getLocalDateStr(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // "YYYY-MM-DD"
}

/**
 * 指定タイムゾーンにおける "YYYY-MM-DD" の深夜 00:00:00 を UTC ISO に変換
 */
function tzDayStart(dateStr: string, timezone: string): string {
  return fromZonedTime(new Date(`${dateStr}T00:00:00`), timezone).toISOString();
}

/**
 * 指定タイムゾーンにおける "YYYY-MM-DD" の 23:59:59.999 を UTC ISO に変換
 */
function tzDayEnd(dateStr: string, timezone: string): string {
  return fromZonedTime(new Date(`${dateStr}T23:59:59.999`), timezone).toISOString();
}

/**
 * "YYYY-MM-DD" 文字列に日数を加算して新しい "YYYY-MM-DD" を返す
 *
 * T12:00:00Z を使うことでランタイムTZに依存しない安全な加算を行う
 */
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 指定タイムゾーンで date が属する週の月曜日（ISO週: 月曜始まり）の "YYYY-MM-DD" を返す
 *
 * "YYYY-MM-DD" を UTC正午で Date 化し getUTCDay() で曜日を安全に取得する
 */
function getWeekStartStr(date: Date, timezone: string): string {
  const todayStr = getLocalDateStr(date, timezone);
  // UTCの正午として解釈することでランタイムTZに依存しない曜日計算
  const d = new Date(`${todayStr}T12:00:00Z`);
  const utcDow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // 月曜始まりのオフセット: Mon=0, Tue=1, ..., Sun=6
  const offset = utcDow === 0 ? 6 : utcDow - 1;
  return addDaysToDateStr(todayStr, -offset);
}

/**
 * 指定タイムゾーンで date が属する月の初日 "YYYY-MM-DD" を返す
 */
function getMonthStartStr(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `${y}-${m}-01`;
}

/**
 * 指定タイムゾーンで date が属する月の末日 "YYYY-MM-DD" を返す
 */
function getMonthEndStr(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const m = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
  // Date(y, m, 0) は m月の末日（mは1-indexed、0日目 = 前月末）
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * 指定タイムゾーンで date が属する年を返す
 */
function getYearInTimezone(date: Date, timezone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
    }).format(date),
    10,
  );
}

// ============================================================
// Public API
// ============================================================

/**
 * 基準日と粒度から絶対的な日付範囲を算出
 *
 * timezone パラメータを使用してユーザーのローカル深夜をUTCに変換する。
 * これにより非UTCユーザーでも正確な日付境界が保証される。
 */
export function computeStatsDateRange(
  currentDate: Date,
  granularity: StatsGranularity,
  timezone: string,
): {
  startDate: string;
  endDate: string;
} {
  switch (granularity) {
    case 'day': {
      const dateStr = getLocalDateStr(currentDate, timezone);
      return {
        startDate: tzDayStart(dateStr, timezone),
        endDate: tzDayEnd(dateStr, timezone),
      };
    }
    case 'week': {
      const startStr = getWeekStartStr(currentDate, timezone);
      const endStr = addDaysToDateStr(startStr, 6);
      return {
        startDate: tzDayStart(startStr, timezone),
        endDate: tzDayEnd(endStr, timezone),
      };
    }
    case 'month': {
      const startStr = getMonthStartStr(currentDate, timezone);
      const endStr = getMonthEndStr(currentDate, timezone);
      return {
        startDate: tzDayStart(startStr, timezone),
        endDate: tzDayEnd(endStr, timezone),
      };
    }
    case 'year': {
      const year = getYearInTimezone(currentDate, timezone);
      return {
        startDate: tzDayStart(`${year}-01-01`, timezone),
        endDate: tzDayEnd(`${year}-12-31`, timezone),
      };
    }
  }
}

/**
 * 現在の日付範囲から前期間の日付範囲を算出
 *
 * day → 前日、week → 前週、month → 前月、year → 前年
 */
export function computePreviousDateRange(
  currentDate: Date,
  granularity: StatsGranularity,
  timezone: string,
): {
  startDate: string;
  endDate: string;
} {
  switch (granularity) {
    case 'day': {
      const prev = addDays(currentDate, -1);
      const dateStr = getLocalDateStr(prev, timezone);
      return {
        startDate: tzDayStart(dateStr, timezone),
        endDate: tzDayEnd(dateStr, timezone),
      };
    }
    case 'week': {
      const prev = addWeeks(currentDate, -1);
      const startStr = getWeekStartStr(prev, timezone);
      const endStr = addDaysToDateStr(startStr, 6);
      return {
        startDate: tzDayStart(startStr, timezone),
        endDate: tzDayEnd(endStr, timezone),
      };
    }
    case 'month': {
      const prev = addMonths(currentDate, -1);
      const startStr = getMonthStartStr(prev, timezone);
      const endStr = getMonthEndStr(prev, timezone);
      return {
        startDate: tzDayStart(startStr, timezone),
        endDate: tzDayEnd(endStr, timezone),
      };
    }
    case 'year': {
      const year = getYearInTimezone(currentDate, timezone) - 1;
      return {
        startDate: tzDayStart(`${year}-01-01`, timezone),
        endDate: tzDayEnd(`${year}-12-31`, timezone),
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
