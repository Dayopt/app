/**
 * 日付範囲フィルター
 *
 * Plan/Record共通で使用する日付範囲フィルタリング。
 */

import { formatInTimeZone } from 'date-fns-tz';

/** 日付範囲フィルターの選択肢（'all'〜'this_month'） */
export type DateRangeFilter =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month';

/**
 * 日付文字列が指定された日付範囲フィルターに一致するか判定
 *
 * @param dateStr - ISO 8601形式の日時文字列
 * @param filter - 日付範囲フィルター
 * @param timezone - ユーザーのタイムゾーン（省略時はブラウザローカル）
 * @returns 一致する場合 true
 */
export function matchesDateRangeFilter(
  dateStr: string | null | undefined,
  filter: DateRangeFilter,
  timezone?: string,
): boolean {
  if (filter === 'all') return true;
  if (!dateStr) return false;

  // ユーザーのタイムゾーンで「今日」の日付文字列（YYYY-MM-DD）を取得
  const now = new Date();
  const todayDateStr = timezone
    ? formatInTimeZone(now, timezone, 'yyyy-MM-dd')
    : formatInTimeZone(now, Intl.DateTimeFormat().resolvedOptions().timeZone, 'yyyy-MM-dd');

  // 比較対象の日付文字列をユーザーのタイムゾーンで取得
  const itemDate = new Date(dateStr);
  const itemDateStr = timezone
    ? formatInTimeZone(itemDate, timezone, 'yyyy-MM-dd')
    : formatInTimeZone(itemDate, Intl.DateTimeFormat().resolvedOptions().timeZone, 'yyyy-MM-dd');

  // YYYY-MM-DD 文字列を比較するためのヘルパー
  const parseDate = (str: string): { year: number; month: number; day: number } => {
    const [year, month, day] = str.split('-').map(Number) as [number, number, number];
    return { year, month, day };
  };

  const todayParts = parseDate(todayDateStr);
  const itemParts = parseDate(itemDateStr);

  // 日付比較用に comparable number に変換（YYYYMMDD）
  const toNum = (p: { year: number; month: number; day: number }): number =>
    p.year * 10000 + p.month * 100 + p.day;

  const todayNum = toNum(todayParts);
  const itemNum = toNum(itemParts);

  switch (filter) {
    case 'today':
      return itemNum === todayNum;

    case 'yesterday': {
      const d = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day - 1));
      const yStr = timezone
        ? formatInTimeZone(d, timezone, 'yyyy-MM-dd')
        : formatInTimeZone(d, Intl.DateTimeFormat().resolvedOptions().timeZone, 'yyyy-MM-dd');
      const yParts = parseDate(yStr);
      return itemNum === toNum(yParts);
    }

    case 'this_week': {
      // 週の開始（日曜）を計算（todayの曜日分を引く）
      const todayDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
      const dayOfWeek = todayDate.getUTCDay();
      const weekStartDate = new Date(todayDate.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      const weekEndDate = new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000);

      const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const wsNum = toNum(parseDate(formatInTimeZone(weekStartDate, tz, 'yyyy-MM-dd')));
      const weNum = toNum(parseDate(formatInTimeZone(weekEndDate, tz, 'yyyy-MM-dd')));
      return itemNum >= wsNum && itemNum <= weNum;
    }

    case 'last_week': {
      const todayDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
      const dayOfWeek = todayDate.getUTCDay();
      const thisWeekStart = new Date(todayDate.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastWeekEnd = new Date(lastWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

      const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const lwsNum = toNum(parseDate(formatInTimeZone(lastWeekStart, tz, 'yyyy-MM-dd')));
      const lweNum = toNum(parseDate(formatInTimeZone(lastWeekEnd, tz, 'yyyy-MM-dd')));
      return itemNum >= lwsNum && itemNum <= lweNum;
    }

    case 'this_month': {
      return itemParts.year === todayParts.year && itemParts.month === todayParts.month;
    }

    default:
      return true;
  }
}
