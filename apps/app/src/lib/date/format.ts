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

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './constants';

// ========================================
// 日付フォーマット
// ========================================

/** `formatDate` 関数に渡すオプション */
export interface DateFormatOptions {
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
export type TimeFormat = '12h' | '24h';

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
// 日時フォーマット
// ========================================

/**
 * 日時をフォーマット
 *
 * @example
 * ```typescript
 * formatDateTime(new Date(), 'ja', '24h'); // "2025年1月22日 14:30"
 * ```
 */
export function formatDateTime(
  date: Date,
  locale: string = 'ja',
  timeFormat: TimeFormat = '24h',
): string {
  return `${formatDate(date, locale)} ${formatTime(date, timeFormat)}`;
}

// ========================================
// 相対時間フォーマット
// ========================================

/** `formatRelativeTime` 関数に渡すオプション */
export interface RelativeTimeOptions {
  /** 基準日時（デフォルト: now） */
  baseDate?: Date;
  /** ロケール（デフォルト: 'ja'） */
  locale?: string;
}

/**
 * 相対時間をフォーマット（〜前、〜後）
 *
 * @param date - フォーマットする日付
 * @param options - オプション
 * @returns 相対時間文字列
 *
 * @example
 * ```typescript
 * formatRelativeTime(new Date(Date.now() - 60000)); // "1分前"
 * formatRelativeTime(new Date(Date.now() - 3600000)); // "1時間前"
 * formatRelativeTime(new Date(Date.now() - 86400000)); // "1日前"
 * ```
 */
export function formatRelativeTime(date: Date, options: RelativeTimeOptions = {}): string {
  const { baseDate = new Date(), locale = 'ja' } = options;
  const diffMs = baseDate.getTime() - date.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs > 0;

  // Intl.RelativeTimeFormat を使用
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absDiffMs < MS_PER_MINUTE) {
    // 1分未満
    const seconds = Math.floor(absDiffMs / 1000);
    return rtf.format(isPast ? -seconds : seconds, 'second');
  }

  if (absDiffMs < MS_PER_HOUR) {
    // 1時間未満
    const minutes = Math.floor(absDiffMs / MS_PER_MINUTE);
    return rtf.format(isPast ? -minutes : minutes, 'minute');
  }

  if (absDiffMs < MS_PER_DAY) {
    // 1日未満
    const hours = Math.floor(absDiffMs / MS_PER_HOUR);
    return rtf.format(isPast ? -hours : hours, 'hour');
  }

  if (absDiffMs < MS_PER_DAY * 30) {
    // 30日未満
    const days = Math.floor(absDiffMs / MS_PER_DAY);
    return rtf.format(isPast ? -days : days, 'day');
  }

  if (absDiffMs < MS_PER_DAY * 365) {
    // 1年未満
    const months = Math.floor(absDiffMs / (MS_PER_DAY * 30));
    return rtf.format(isPast ? -months : months, 'month');
  }

  // 1年以上
  const years = Math.floor(absDiffMs / (MS_PER_DAY * 365));
  return rtf.format(isPast ? -years : years, 'year');
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

// ========================================
// 曜日
// ========================================

/**
 * 曜日を取得
 */
export function getWeekdayName(
  date: Date,
  locale: string = 'ja',
  format: 'long' | 'short' = 'short',
): string {
  return new Intl.DateTimeFormat(locale, { weekday: format }).format(date);
}

/**
 * 曜日インデックス（0=日曜, 1=月曜, ...）から曜日名を取得
 */
export function getWeekdayNameByIndex(
  index: number,
  locale: string = 'ja',
  format: 'long' | 'short' = 'short',
): string {
  // 2024-01-07 は日曜日
  const baseDate = new Date(2024, 0, 7 + index);
  return getWeekdayName(baseDate, locale, format);
}
