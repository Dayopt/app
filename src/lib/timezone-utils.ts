/**
 * 設定用タイムゾーンユーティリティ
 *
 * 共通のタイムゾーン関数は @/lib/date から再エクスポート。
 * このファイルは設定固有の機能（日本語ラベル、DateFormatType依存）を提供。
 */

import { formatDateWithTimezone } from '@/lib/date';

import type { DateFormatType } from '@/stores/useCalendarSettingsStore';

// ========================================
// @/lib/date からの再エクスポート
// ========================================
export {
  convertFromTimezone,
  convertToTimezone,
  formatDateWithTimezone,
  formatInTimezone,
  formatInTimezone as formatInTimeZone,
  formatTimeWithTimezone,
  getBrowserTimezone,
  getTimezoneAbbreviation,
} from '@/lib/date';

// ========================================
// 設定固有の機能
// ========================================

/** 日本語ラベル付きタイムゾーン情報（設定UI用） */
export interface TimezoneInfoJa {
  value: string;
  label: string;
  offset: number;
}

/**
 * タイムゾーンリストの取得（日本語ラベル付き）
 *
 * 設定UIで使用するための日本語ラベル付きリスト。
 * 英語版は `getCommonTimezones` from '@/lib/date' を使用。
 */
export function getTimeZones(): TimezoneInfoJa[] {
  const timezones: TimezoneInfoJa[] = [
    { value: 'Pacific/Honolulu', label: 'ホノルル (GMT-10)', offset: -10 },
    { value: 'America/Anchorage', label: 'アンカレッジ (GMT-9)', offset: -9 },
    { value: 'America/Los_Angeles', label: 'ロサンゼルス (GMT-8)', offset: -8 },
    { value: 'America/Denver', label: 'デンバー (GMT-7)', offset: -7 },
    { value: 'America/Chicago', label: 'シカゴ (GMT-6)', offset: -6 },
    { value: 'America/New_York', label: 'ニューヨーク (GMT-5)', offset: -5 },
    { value: 'America/Sao_Paulo', label: 'サンパウロ (GMT-3)', offset: -3 },
    { value: 'Europe/London', label: 'ロンドン (GMT+0)', offset: 0 },
    { value: 'Europe/Paris', label: 'パリ (GMT+1)', offset: 1 },
    { value: 'Europe/Moscow', label: 'モスクワ (GMT+3)', offset: 3 },
    { value: 'Asia/Dubai', label: 'ドバイ (GMT+4)', offset: 4 },
    { value: 'Asia/Kolkata', label: 'コルカタ (GMT+5:30)', offset: 5.5 },
    { value: 'Asia/Singapore', label: 'シンガポール (GMT+8)', offset: 8 },
    { value: 'Asia/Shanghai', label: '上海 (GMT+8)', offset: 8 },
    { value: 'Asia/Tokyo', label: '東京 (GMT+9)', offset: 9 },
    { value: 'Australia/Sydney', label: 'シドニー (GMT+10)', offset: 10 },
    { value: 'Pacific/Auckland', label: 'オークランド (GMT+12)', offset: 12 },
  ];

  return timezones.sort((a, b) => a.offset - b.offset);
}

/**
 * 時間のみのフォーマット（時間軸用）
 *
 * カレンダーの時間軸ラベルなど、時間のみを表示する際に使用。
 */
export function formatHour(hour: number, timeFormat: '12h' | '24h'): string {
  if (timeFormat === '24h') {
    return `${hour}:00`;
  }

  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * 日付をユーザー設定のフォーマットで表示
 *
 * DateFormatType（設定固有の型）を使用するため、このファイルに残す。
 *
 * @param date - フォーマットする日付
 * @param dateFormat - 日付フォーマット設定
 * @param timezone - オプションのタイムゾーン
 */
export function formatDateWithSettings(
  date: Date,
  dateFormat: DateFormatType,
  timezone?: string,
): string {
  return formatDateWithTimezone(date, dateFormat, timezone);
}

/**
 * 日付と時刻をユーザー設定のフォーマットで表示
 *
 * @param date - フォーマットする日付
 * @param dateFormat - 日付フォーマット設定
 * @param timeFormat - 時間フォーマット設定
 * @param timezone - オプションのタイムゾーン
 */
export function formatDateTimeWithSettings(
  date: Date,
  dateFormat: DateFormatType,
  timeFormat: '12h' | '24h',
  timezone?: string,
): string {
  const timeFormatString = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
  const fullFormat = `${dateFormat} ${timeFormatString}`;
  return formatDateWithTimezone(date, fullFormat, timezone);
}
