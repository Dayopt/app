/**
 * タイムゾーンユーティリティ
 *
 * date-fns-tz をベースにしたタイムゾーン変換・フォーマット。
 * アプリ全体で統一されたタイムゾーン処理を提供。
 *
 * @example
 * ```typescript
 * import { convertToTimezone, formatInTimezone, getBrowserTimezone } from '@/lib/date';
 *
 * const browserTz = getBrowserTimezone();
 * const localDate = convertToTimezone(utcDate, userTz);
 * const formatted = formatInTimezone(utcDate, userTz, 'yyyy-MM-dd HH:mm');
 * ```
 */

import { startOfWeek as dfStartOfWeek, endOfMonth, format, startOfMonth } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

// ========================================
// タイムゾーン変換
// ========================================

/**
 * UTC時刻を指定タイムゾーンの時刻に変換
 *
 * **注意**: 返されるDateオブジェクトのgetHours()等は指定TZでの値を返す
 *
 * @param utcDate - UTC日時
 * @param timezone - 変換先タイムゾーン（例: 'Asia/Tokyo'）
 * @returns タイムゾーン変換されたDateオブジェクト
 *
 * @example
 * ```typescript
 * // UTC 05:00 → JST 14:00
 * const jstDate = convertToTimezone(new Date('2025-01-22T05:00:00Z'), 'Asia/Tokyo');
 * jstDate.getHours(); // => 14
 * ```
 */
export function convertToTimezone(utcDate: Date, timezone: string): Date {
  return toZonedTime(utcDate, timezone);
}

/**
 * 指定タイムゾーンの時刻をUTCに変換
 *
 * @param zonedDate - タイムゾーン付き日時
 * @param timezone - 元のタイムゾーン（例: 'Asia/Tokyo'）
 * @returns UTC Dateオブジェクト
 *
 * @example
 * ```typescript
 * // JST 14:00 → UTC 05:00
 * const utcDate = convertFromTimezone(localDate, 'Asia/Tokyo');
 * ```
 */
export function convertFromTimezone(zonedDate: Date, timezone: string): Date {
  return fromZonedTime(zonedDate, timezone);
}

// ========================================
// タイムゾーン対応フォーマット
// ========================================

/**
 * 日時を指定タイムゾーンでフォーマット
 *
 * @param date - フォーマットする日時
 * @param timezone - タイムゾーン
 * @param formatString - フォーマット文字列（date-fns形式）
 * @returns フォーマットされた文字列
 *
 * @example
 * ```typescript
 * formatInTimezone(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
 * // => "2025-01-22 14:30"
 * ```
 */
export function formatInTimezone(date: Date, timezone: string, formatString: string): string {
  return formatInTimeZone(date, timezone, formatString);
}

/**
 * 日時をフォーマット（タイムゾーンオプション付き）
 *
 * @param date - フォーマットする日時
 * @param formatString - フォーマット文字列
 * @param timezone - オプションのタイムゾーン（省略時はローカル）
 */
export function formatDateWithTimezone(
  date: Date,
  formatString: string,
  timezone?: string,
): string {
  if (timezone) {
    return formatInTimeZone(date, timezone, formatString);
  }
  return format(date, formatString);
}

/**
 * 時刻をタイムゾーン対応でフォーマット
 *
 * @param date - フォーマットする日時
 * @param timeFormat - '12h' または '24h'
 * @param timezone - オプションのタイムゾーン
 */
export function formatTimeWithTimezone(
  date: Date,
  timeFormat: '12h' | '24h',
  timezone?: string,
): string {
  const formatString = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';

  if (timezone) {
    return formatInTimeZone(date, timezone, formatString);
  }
  return format(date, formatString);
}

// ========================================
// ユーザータイムゾーン
// ========================================

/**
 * ブラウザのタイムゾーンを取得
 *
 * ストアに保存されたユーザー設定ではなく、ブラウザが報告するタイムゾーンを返す。
 * ユーザーのタイムゾーンが必要な場合は Zustand ストアの timezone を使用すること。
 *
 * @returns タイムゾーン文字列（例: 'Asia/Tokyo'）
 */
export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * タイムゾーンの略称を取得
 *
 * @param timezone - タイムゾーン（例: 'Asia/Tokyo'）
 * @returns 略称（例: 'JST'）
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
  // Intl API で動的に取得（DST切り替えを正しく反映: EST↔EDT, PST↔PDT等）
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((part) => part.type === 'timeZoneName');
    return tzPart?.value || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * タイムゾーンのオフセットを取得（時間単位）
 *
 * @param timezone - タイムゾーン
 * @param date - 基準日時（DST考慮）
 * @returns オフセット（例: 9 for JST）
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
}

// ========================================
// ISO変換
// ========================================

/**
 * ユーザーのタイムゾーンの時刻をUTC ISO文字列に変換
 *
 * @param localDate - ローカル日付
 * @param hours - 時（0-23）
 * @param minutes - 分（0-59）
 * @param timezone - ユーザーのタイムゾーン
 * @returns UTC ISO 8601文字列
 *
 * @example
 * ```typescript
 * // JST 14:30 → UTC ISO
 * localTimeToUTCISO(new Date(2025, 0, 22), 14, 30, 'Asia/Tokyo');
 * // => "2025-01-22T05:30:00.000Z"
 * ```
 */
export function localTimeToUTCISO(
  localDate: Date,
  hours: number,
  minutes: number,
  timezone: string,
): string {
  const year = localDate.getFullYear();
  const month = localDate.getMonth();
  const day = localDate.getDate();

  const zonedDate = new Date(year, month, day, hours, minutes, 0, 0);
  const utcDate = fromZonedTime(zonedDate, timezone);

  return utcDate.toISOString();
}

/**
 * ISO 8601文字列をユーザーのタイムゾーンで解釈したDateに変換
 *
 * @param isoString - ISO 8601形式の日時文字列
 * @param timezone - ユーザーのタイムゾーン
 * @returns タイムゾーン変換されたDateオブジェクト
 */
export function parseISOToUserTimezone(isoString: string, timezone: string): Date {
  const utcDate = new Date(isoString);
  if (isNaN(utcDate.getTime())) {
    throw new Error(`Invalid ISO datetime: ${isoString}`);
  }
  return toZonedTime(utcDate, timezone);
}

// ========================================
// タイムゾーンリスト
// ========================================

/** タイムゾーン情報 */
export interface TimezoneInfo {
  value: string;
  label: string;
  offset: number;
}

/**
 * よく使われるタイムゾーンのリストを取得
 */
export function getCommonTimezones(): TimezoneInfo[] {
  return [
    { value: 'Pacific/Honolulu', label: 'Honolulu (GMT-10)', offset: -10 },
    { value: 'America/Anchorage', label: 'Anchorage (GMT-9)', offset: -9 },
    { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8)', offset: -8 },
    { value: 'America/Denver', label: 'Denver (GMT-7)', offset: -7 },
    { value: 'America/Chicago', label: 'Chicago (GMT-6)', offset: -6 },
    { value: 'America/New_York', label: 'New York (GMT-5)', offset: -5 },
    { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)', offset: -3 },
    { value: 'Europe/London', label: 'London (GMT+0)', offset: 0 },
    { value: 'Europe/Paris', label: 'Paris (GMT+1)', offset: 1 },
    { value: 'Europe/Moscow', label: 'Moscow (GMT+3)', offset: 3 },
    { value: 'Asia/Dubai', label: 'Dubai (GMT+4)', offset: 4 },
    { value: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)', offset: 5.5 },
    { value: 'Asia/Singapore', label: 'Singapore (GMT+8)', offset: 8 },
    { value: 'Asia/Shanghai', label: 'Shanghai (GMT+8)', offset: 8 },
    { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)', offset: 9 },
    { value: 'Australia/Sydney', label: 'Sydney (GMT+10)', offset: 10 },
    { value: 'Pacific/Auckland', label: 'Auckland (GMT+12)', offset: 12 },
  ].sort((a, b) => a.offset - b.offset);
}

// ========================================
// TZ境界ヘルパー
// ========================================

/**
 * ユーザーTZの0:00をUTC ISOで返す
 *
 * @param date - 基準日（任意TZ）
 * @param timezone - ユーザーのタイムゾーン
 * @returns UTC ISO 8601文字列
 */
export function tzDayStart(date: Date, timezone: string): string {
  const localDateStr = formatInTimeZone(date, timezone, 'yyyy-MM-dd');
  return fromZonedTime(new Date(`${localDateStr}T00:00:00`), timezone).toISOString();
}

/**
 * ユーザーTZの23:59:59.999をUTC ISOで返す
 *
 * @param date - 基準日（任意TZ）
 * @param timezone - ユーザーのタイムゾーン
 * @returns UTC ISO 8601文字列
 */
export function tzDayEnd(date: Date, timezone: string): string {
  const localDateStr = formatInTimeZone(date, timezone, 'yyyy-MM-dd');
  return fromZonedTime(new Date(`${localDateStr}T23:59:59.999`), timezone).toISOString();
}

/**
 * ユーザーTZの週初日0:00をUTC ISOで返す
 *
 * @param date - 基準日
 * @param timezone - ユーザーのタイムゾーン
 * @param weekStartsOn - 週の開始曜日（0=日, 1=月, 6=土）。デフォルト1
 * @returns UTC ISO 8601文字列
 */
export function tzWeekStart(date: Date, timezone: string, weekStartsOn: 0 | 1 | 6 = 1): string {
  const zonedDate = toZonedTime(date, timezone);
  const weekStart = dfStartOfWeek(zonedDate, { weekStartsOn });
  const dateStr = format(weekStart, 'yyyy-MM-dd');
  return fromZonedTime(new Date(`${dateStr}T00:00:00`), timezone).toISOString();
}

/**
 * ユーザーTZの週末日23:59:59.999をUTC ISOで返す
 *
 * @param date - 基準日
 * @param timezone - ユーザーのタイムゾーン
 * @param weekStartsOn - 週の開始曜日（0=日, 1=月, 6=土）。デフォルト1
 * @returns UTC ISO 8601文字列
 */
export function tzWeekEnd(date: Date, timezone: string, weekStartsOn: 0 | 1 | 6 = 1): string {
  const zonedDate = toZonedTime(date, timezone);
  const weekStart = dfStartOfWeek(zonedDate, { weekStartsOn });
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const dateStr = format(weekEndDate, 'yyyy-MM-dd');
  return fromZonedTime(new Date(`${dateStr}T23:59:59.999`), timezone).toISOString();
}

/**
 * ユーザーTZの月初0:00をUTC ISOで返す
 *
 * @param date - 基準日
 * @param timezone - ユーザーのタイムゾーン
 * @returns UTC ISO 8601文字列
 */
export function tzMonthStart(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  const monthStart = startOfMonth(zonedDate);
  const dateStr = format(monthStart, 'yyyy-MM-dd');
  return fromZonedTime(new Date(`${dateStr}T00:00:00`), timezone).toISOString();
}

/**
 * ユーザーTZの月末23:59:59.999をUTC ISOで返す
 *
 * @param date - 基準日
 * @param timezone - ユーザーのタイムゾーン
 * @returns UTC ISO 8601文字列
 */
export function tzMonthEnd(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  const monthEndDate = endOfMonth(zonedDate);
  const dateStr = format(monthEndDate, 'yyyy-MM-dd');
  return fromZonedTime(new Date(`${dateStr}T23:59:59.999`), timezone).toISOString();
}

/**
 * ユーザーTZの"今日"をYYYY-MM-DD文字列で返す
 *
 * @param timezone - ユーザーのタイムゾーン
 * @returns YYYY-MM-DD形式の文字列
 */
export function tzToday(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

/**
 * 2つのUTC DateがユーザーTZで同じ日かどうか
 *
 * @param a - 比較対象1
 * @param b - 比較対象2
 * @param timezone - ユーザーのタイムゾーン
 * @returns 同一日ならtrue
 */
export function tzIsSameDay(a: Date, b: Date, timezone: string): boolean {
  return (
    formatInTimeZone(a, timezone, 'yyyy-MM-dd') === formatInTimeZone(b, timezone, 'yyyy-MM-dd')
  );
}

/**
 * 指定 Date がユーザー TZ における「今日」かどうか
 *
 * date-fns の `isToday` はブラウザのローカル TZ を基準とするため、
 * ユーザーが設定した calendar timezone と OS TZ が異なる場合に
 * 「今日」のハイライトが 1 日ずれる問題が発生する。
 * カレンダー UI からはこの helper を使うこと。
 *
 * @param date - 判定対象（UTC Date）
 * @param timezone - ユーザーのタイムゾーン
 * @param now - 比較基準（テスト用）。省略時は現在時刻
 * @returns ユーザー TZ で今日と同じ日付なら true
 */
export function isTodayInTimezone(date: Date, timezone: string, now: Date = new Date()): boolean {
  return tzIsSameDay(date, now, timezone);
}

/**
 * ユーザーTZでの日付キー (YYYY-MM-DD)
 *
 * @param date - 対象日時
 * @param timezone - ユーザーのタイムゾーン
 * @returns YYYY-MM-DD形式の文字列
 */
export function tzGetDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}
