import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '@/lib/date/core';

import type { StatsGranularity } from '../stores/useStatsFilterStore';

/**
 * ローカル日付から UTC midnight の ISO 文字列を生成
 *
 * サーバー(UTC)とクライアント(JST等)で同じローカル日付なら同じ文字列を返す。
 * これにより tRPC のクエリキー（= input オブジェクト）が一致し、
 * サーバー prefetch のキャッシュがクライアントで正しくヒットする。
 *
 * 例: 2026-03-23 00:00 JST → "2026-03-23T00:00:00.000Z"
 *     2026-03-23 00:00 UTC → "2026-03-23T00:00:00.000Z"（同じ文字列）
 */
function toLocalDateUTCStart(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

/** ローカル日付の 23:59:59.999 を UTC ISO 文字列として生成 */
function toLocalDateUTCEnd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T23:59:59.999Z`;
}

/**
 * 基準日と粒度から絶対的な日付範囲を算出
 *
 * ⚠ toISOString() を直接使わない。ローカルタイムゾーンの日付境界を
 *   UTC midnight として正規化し、サーバー/クライアント間のキャッシュキー一致を保証する。
 */
export function computeStatsDateRange(
  currentDate: Date,
  granularity: StatsGranularity,
): {
  startDate: string;
  endDate: string;
} {
  switch (granularity) {
    case 'day': {
      const start = startOfDay(currentDate);
      return {
        startDate: toLocalDateUTCStart(start),
        endDate: toLocalDateUTCEnd(start),
      };
    }
    case 'week': {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return {
        startDate: toLocalDateUTCStart(start),
        endDate: toLocalDateUTCEnd(end),
      };
    }
    case 'month': {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return {
        startDate: toLocalDateUTCStart(start),
        endDate: toLocalDateUTCEnd(end),
      };
    }
    case 'year': {
      const year = currentDate.getFullYear();
      return {
        startDate: `${year}-01-01T00:00:00.000Z`,
        endDate: `${year}-12-31T23:59:59.999Z`,
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
): {
  startDate: string;
  endDate: string;
} {
  switch (granularity) {
    case 'day': {
      const prev = addDays(currentDate, -1);
      const start = startOfDay(prev);
      return {
        startDate: toLocalDateUTCStart(start),
        endDate: toLocalDateUTCEnd(start),
      };
    }
    case 'week': {
      const prev = addWeeks(currentDate, -1);
      const start = startOfWeek(prev);
      const end = endOfWeek(prev);
      return {
        startDate: toLocalDateUTCStart(start),
        endDate: toLocalDateUTCEnd(end),
      };
    }
    case 'month': {
      const prev = addMonths(currentDate, -1);
      const start = startOfMonth(prev);
      const end = endOfMonth(prev);
      return {
        startDate: toLocalDateUTCStart(start),
        endDate: toLocalDateUTCEnd(end),
      };
    }
    case 'year': {
      const year = currentDate.getFullYear() - 1;
      return {
        startDate: `${year}-01-01T00:00:00.000Z`,
        endDate: `${year}-12-31T23:59:59.999Z`,
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
