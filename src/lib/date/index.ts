/**
 * 日付ユーティリティライブラリ
 *
 * アプリ全体で統一された日付操作を提供
 *
 * @example
 * ```typescript
 * import {
 *   // 日付計算
 *   startOfDay, endOfDay, addDays, isSameDay,
 *   // フォーマット
 *   formatDate, formatTime, formatRelativeTime,
 *   // タイムゾーン
 *   convertToTimezone, formatInTimezone, getBrowserTimezone,
 * } from '@/lib/date';
 * ```
 *
 * ## 使い分けガイド
 *
 * ### 基本的な日付計算（core.ts）
 * - 日の境界: `startOfDay`, `endOfDay`
 * - 週の境界: `startOfWeek`, `endOfWeek`
 * - 月の境界: `startOfMonth`, `endOfMonth`
 * - 日付加算: `addDays`, `addWeeks`, `addMonths`
 * - 比較: `isSameDay`, `isToday`, `isBefore`
 * - キー生成: `getDateKey`, `getMonthKey`
 *
 * ### フォーマット（format.ts）
 * - 日付: `formatDate`, `formatDateShort`, `formatDateISO`
 * - 時刻: `formatTime`, `formatHour`, `formatTimeRange`
 * - 相対時間: `formatRelativeTime`
 * - 期間: `formatDuration`, `formatDurationMinutes`
 *
 * ### タイムゾーン（timezone.ts）
 * - 変換: `convertToTimezone`, `convertFromTimezone`
 * - フォーマット: `formatInTimezone`, `formatTimeWithTimezone`
 * - ブラウザTZ: `getBrowserTimezone`, `getTimezoneAbbreviation`
 * - ISO変換: `localTimeToUTCISO`, `parseISOToUserTimezone`
 */

// ========================================
// Core - 基本的な日付計算
// ========================================
export {
  // 日付加算・減算
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  // 配列生成
  generateDateRange,
  // キー生成
  getDateKey,
  // 差分計算
  getDaysDifference,
  getMonthDates,
  getMonthKey,
  getTimeDifference,
  getWeekDates,
  isAfter,
  isBefore,
  // 比較・判定
  isSameDay,
  isToday,
  isTomorrow,
  isValidDate,
  isWeekend,
  isWithinRange,
  isYesterday,
  normalizeDate,
  // パース
  parseDateString,
  // 日の境界
  startOfDay,
  // 月の境界
  startOfMonth,
  // 週の境界
  startOfWeek,
  subDays,
} from './core';

// ========================================
// Format - フォーマット
// ========================================
export {
  // 日付フォーマット
  formatDate,
  formatDateISO,
  formatDateShort,
  // 日時フォーマット
  formatDateTime,
  // 期間
  formatDuration,
  formatDurationMinutes,
  formatHour,
  // 相対時間
  formatRelativeTime,
  // 時刻フォーマット
  formatTime,
  formatTimeRange,
  // 曜日
  getWeekdayName,
  getWeekdayNameByIndex,
  type DateFormatOptions,
  type RelativeTimeOptions,
  // 型
  type TimeFormat,
} from './format';

// ========================================
// Timezone - タイムゾーン
// ========================================
export {
  convertFromTimezone,
  // 変換
  convertToTimezone,
  formatDateWithTimezone,
  // フォーマット
  formatInTimezone,
  formatTimeWithTimezone,
  // ブラウザタイムゾーン
  getBrowserTimezone,
  // タイムゾーンリスト
  getCommonTimezones,
  getTimezoneAbbreviation,
  getTimezoneOffset,
  // ISO変換
  localTimeToUTCISO,
  parseISOToUserTimezone,
  // TZ境界ヘルパー
  tzDayEnd,
  tzDayStart,
  tzGetDateKey,
  tzIsSameDay,
  tzMonthEnd,
  tzMonthStart,
  tzToday,
  tzWeekEnd,
  tzWeekStart,
  type TimezoneInfo,
} from './timezone';

// ========================================
// Filter - 日付範囲フィルター
// ========================================
export { matchesDateRangeFilter, type DateRangeFilter } from './filter';

// ========================================
// 定数の再エクスポート
// ========================================
export {
  CACHE_10_MINUTES,
  CACHE_1_HOUR,
  CACHE_2_MINUTES,
  CACHE_30_MINUTES,
  CACHE_5_MINUTES,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  MS_PER_WEEK,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  daysToMs,
  hoursToMs,
  minutesToMs,
  msToDays,
  msToHours,
  msToMinutes,
  msToSeconds,
} from './constants';
