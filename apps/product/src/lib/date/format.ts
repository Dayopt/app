/**
 * 日付フォーマットユーティリティ
 *
 * ロケール対応のフォーマッティングを提供。
 * タイムゾーン対応フォーマットは ./timezone.ts を使用。
 *
 * @example
 * ```typescript
 * import { formatDate, formatTime, formatRelativeTime } from '@/lib/date';
 *
 * formatDate(new Date(), 'ja'); // "2025年1月22日"
 * formatTime(new Date(), '24h'); // "14:30"
 * formatRelativeTime(new Date(Date.now() - 3600000)); // "1時間前"
 * ```
 */

import { MS_PER_HOUR, MS_PER_MINUTE } from './constants';

// ========================================
// 日付フォーマット
// ========================================

/** `formatDate` 関数に渡すオプション */
interface DateFormatOptions {
  /** 年を含めるか（デフォルト: true） */
  includeYear?: boolean;
  /** 曜日を含めるか（デフォルト: false） */
  includeWeekday?: boolean;
  /** フォーマットスタイル（デフォルト: 'medium'） */
  style?: 'short' | 'medium' | 'long';
}

/**
 * 日付をロケールに応じてフォーマット
 *
 * @param date - フォーマットする日付
 * @param locale - ロケール（例: 'ja', 'en', 'en-US'）
 * @param options - フォーマットオプション
 * @returns フォーマットされた日付文字列
 *
 * @example
 * ```typescript
 * formatDate(new Date(), 'ja'); // "2025年1月22日"
 * formatDate(new Date(), 'en'); // "January 22, 2025"
 * formatDate(new Date(), 'ja', { includeWeekday: true }); // "2025年1月22日(水)"
 * ```
 */
export function formatDate(
  date: Date,
  locale: string = 'ja',
  options: DateFormatOptions = {},
): string {
  const { includeYear = true, includeWeekday = false, style = 'medium' } = options;

  const intlOptions: Intl.DateTimeFormatOptions = {
    year: includeYear ? 'numeric' : undefined,
    month: style === 'short' ? 'numeric' : style === 'long' ? 'long' : 'short',
    day: 'numeric',
    weekday: includeWeekday ? 'short' : undefined,
  };

  return new Intl.DateTimeFormat(locale, intlOptions).format(date);
}

/**
 * 日付を短形式でフォーマット（M/D または MM/DD）
 */
export function formatDateShort(date: Date, locale: string = 'ja'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

/**
 * 日付をISO形式（YYYY-MM-DD）でフォーマット
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ========================================
// 時刻フォーマット
// ========================================

/** 時刻フォーマットの種別（12時間制 or 24時間制） */
type TimeFormat = '12h' | '24h';

/**
 * 時刻をフォーマット
 *
 * @param date - フォーマットする日付
 * @param format - 12h または 24h
 * @returns フォーマットされた時刻文字列
 *
 * @example
 * ```typescript
 * formatTime(new Date('2025-01-22T14:30:00'), '24h'); // "14:30"
 * formatTime(new Date('2025-01-22T14:30:00'), '12h'); // "2:30 PM"
 * ```
 */
export function formatTime(date: Date, format: TimeFormat = '24h'): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const paddedMinutes = minutes.toString().padStart(2, '0');

  if (format === '24h') {
    return `${hours}:${paddedMinutes}`;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${paddedMinutes} ${period}`;
}

/**
 * 時間（0-23）を時刻文字列としてフォーマット
 *
 * @example
 * ```typescript
 * formatHour(14, '24h'); // "14:00"
 * formatHour(14, '12h'); // "2:00 PM"
 * ```
 */
export function formatHour(hour: number, format: TimeFormat = '24h'): string {
  if (format === '24h') {
    return `${hour}:00`;
  }

  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * 時間範囲をフォーマット
 *
 * @example
 * ```typescript
 * formatTimeRange(start, end, '24h'); // "9:00 - 17:00"
 * ```
 */
export function formatTimeRange(start: Date, end: Date, format: TimeFormat = '24h'): string {
  return `${formatTime(start, format)} - ${formatTime(end, format)}`;
}

// ========================================
// 期間フォーマット
// ========================================

/**
 * 期間（ミリ秒）を人間が読める形式にフォーマット
 *
 * @example
 * ```typescript
 * formatDuration(3661000); // "1時間1分1秒"
 * formatDuration(3600000); // "1時間"
 * formatDuration(90000); // "1分30秒"
 * ```
 */
export function formatDuration(ms: number, locale: string = 'ja'): string {
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / 1000);

  const parts: string[] = [];

  if (locale === 'ja') {
    if (hours > 0) parts.push(`${hours}時間`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
    return parts.join('');
  }

  // English format
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * 期間（分）を簡潔にフォーマット
 *
 * @example
 * ```typescript
 * formatDurationMinutes(90); // "1h 30m"
 * formatDurationMinutes(45); // "45m"
 * ```
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export const KNIP_CI_PROBE = true;

// ========================================
// 曜日
// ========================================
