/**
 * 日付操作コアユーティリティ
 *
 * 基本的な日付計算を提供。外部ライブラリなしでネイティブDateを使用。
 * タイムゾーン考慮が必要な場合は ./timezone.ts を使用すること。
 *
 * @example
 * ```typescript
 * import { startOfDay, addDays, isSameDay } from '@/lib/date';
 *
 * const today = startOfDay(new Date());
 * const tomorrow = addDays(today, 1);
 * console.log(isSameDay(today, new Date())); // true
 * ```
 */

import { MS_PER_DAY } from './constants';

// ========================================
// 日の境界
// ========================================

/**
 * 日付を日の開始時刻（00:00:00.000）に設定
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 日付を日の終了時刻（23:59:59.999）に設定
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

// ========================================
// 週の境界
// ========================================

interface WeekOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * 週の開始日を取得
 * @param date 基準日
 * @param options.weekStartsOn 週の開始曜日（0=日曜, 1=月曜, ...）デフォルトは月曜(1)
 */
export function startOfWeek(date: Date, options?: WeekOptions): Date {
  const weekStartsOn = options?.weekStartsOn ?? 1; // デフォルト: 月曜始まり
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 週の終了日を取得
 * @param date 基準日
 * @param options.weekStartsOn 週の開始曜日（0=日曜, 1=月曜, ...）デフォルトは月曜(1)
 */
export function endOfWeek(date: Date, options?: WeekOptions): Date {
  const start = startOfWeek(date, options);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

// ========================================
// 月の境界
// ========================================

/**
 * 月の開始日を取得（1日 00:00:00）
 */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 月の終了日を取得（月末 23:59:59）
 */
export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0); // 次の月の0日 = 今月の最終日
  result.setHours(23, 59, 59, 999);
  return result;
}

// ========================================
// 日付加算
// ========================================

/**
 * 日付を指定日数分移動
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 日付を指定日数分戻す
 */
export function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

/**
 * 日付を指定週数分移動
 */
export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/**
 * 日付を指定月数分移動
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * 時刻を指定分数分移動
 */
export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

/**
 * 時刻を指定時間数分移動
 */
export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

// ========================================
// 比較・判定
// ========================================

/**
 * 同じ日かどうか判定
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

/**
 * 今日かどうか判定
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * 明日かどうか判定
 */
export function isTomorrow(date: Date): boolean {
  return isSameDay(date, addDays(new Date(), 1));
}

/**
 * 昨日かどうか判定
 */
export function isYesterday(date: Date): boolean {
  return isSameDay(date, addDays(new Date(), -1));
}

/**
 * 週末かどうか判定（土日）
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * date1がdate2より前かどうか
 */
export function isBefore(date1: Date, date2: Date): boolean {
  return date1.getTime() < date2.getTime();
}

/**
 * date1がdate2より後かどうか
 */
export function isAfter(date1: Date, date2: Date): boolean {
  return date1.getTime() > date2.getTime();
}

/**
 * 日付がrangeの範囲内かどうか
 */
export function isWithinRange(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

// ========================================
// 差分計算
// ========================================

/**
 * 日付の差を日数で取得
 */
export function getDaysDifference(date1: Date, date2: Date): number {
  const d1 = startOfDay(date1);
  const d2 = startOfDay(date2);
  return Math.floor((d2.getTime() - d1.getTime()) / MS_PER_DAY);
}

/**
 * ミリ秒差を取得
 */
export function getTimeDifference(date1: Date, date2: Date): number {
  return date2.getTime() - date1.getTime();
}

// ========================================
// 配列生成
// ========================================

/**
 * 日付配列を生成
 */
export function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 週の日付配列を生成（月曜〜日曜）
 */
export function getWeekDates(date: Date): Date[] {
  const start = startOfWeek(date);
  return generateDateRange(start, addDays(start, 6));
}

/**
 * 月の日付配列を生成
 */
export function getMonthDates(date: Date): Date[] {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return generateDateRange(start, end);
}

// ========================================
// キー生成
// ========================================

/**
 * 日付キー生成（YYYY-MM-DD形式）
 * キャッシュキーやMapのキーとして使用
 */
export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 月キー生成（YYYY-MM形式）
 */
export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ========================================
// パース
// ========================================

/**
 * YYYY-MM-DD文字列をローカルタイムゾーンのDateオブジェクトに変換
 *
 * **注意**: `new Date('YYYY-MM-DD')`はUTCとして解釈されるため、
 * ローカルタイムゾーンでは前日になることがある。この関数はその問題を回避。
 *
 * @example
 * ```typescript
 * const date = parseDateString('2025-01-22');
 * // 日本時間: 2025-01-22 00:00:00（前日にならない）
 * ```
 */
export function parseDateString(dateString: string): Date {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD.`);
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10) - 1; // 0始まり
  const day = parseInt(dayStr!, 10);

  return new Date(year, month, day);
}

/**
 * 日付を検証してDateオブジェクトに変換
 * Date, string, null/undefined に対応
 */
export function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 日付が有効かどうか判定
 */
export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}
