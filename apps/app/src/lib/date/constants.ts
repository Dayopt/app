/**
 * 時間関連の定数
 *
 * マジックナンバーを排除し、時間計算を統一
 *
 * @example
 * ```typescript
 * import { MS_PER_HOUR, msToMinutes, msToHours } from '@/lib/date'
 *
 * // 直接定数を使用
 * const hours = diffMs / MS_PER_HOUR
 *
 * // ユーティリティ関数を使用
 * const minutes = msToMinutes(diffMs)
 * ```
 */

// ========================================
// ミリ秒定数
// ========================================

/** 1秒 = 1000ミリ秒 */
export const MS_PER_SECOND = 1000;

/** 1分 = 60,000ミリ秒 */
export const MS_PER_MINUTE = 1000 * 60;

/** 1時間 = 3,600,000ミリ秒 */
export const MS_PER_HOUR = 1000 * 60 * 60;

/** 1日 = 86,400,000ミリ秒 */
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** 1週間 = 604,800,000ミリ秒 */
export const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

// ========================================
// 秒定数
// ========================================

/** 1分 = 60秒 */
export const SECONDS_PER_MINUTE = 60;

/** 1時間 = 3,600秒 */
export const SECONDS_PER_HOUR = 60 * 60;

/** 1日 = 86,400秒 */
export const SECONDS_PER_DAY = 60 * 60 * 24;

// ========================================
// 分定数
// ========================================

/** 1時間 = 60分 */
export const MINUTES_PER_HOUR = 60;

/** 1日 = 1,440分 */
export const MINUTES_PER_DAY = 60 * 24;

// ========================================
// 変換ユーティリティ
// ========================================

/**
 * ミリ秒を秒に変換
 */
export function msToSeconds(ms: number): number {
  return ms / MS_PER_SECOND;
}

/**
 * ミリ秒を分に変換
 */
export function msToMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}

/**
 * ミリ秒を時間に変換
 */
export function msToHours(ms: number): number {
  return ms / MS_PER_HOUR;
}

/**
 * ミリ秒を日数に変換
 */
export function msToDays(ms: number): number {
  return ms / MS_PER_DAY;
}

/**
 * 分をミリ秒に変換
 */
export function minutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE;
}

/**
 * 時間をミリ秒に変換
 */
export function hoursToMs(hours: number): number {
  return hours * MS_PER_HOUR;
}

/**
 * 日数をミリ秒に変換
 */
export function daysToMs(days: number): number {
  return days * MS_PER_DAY;
}

// ========================================
// キャッシュ用定数
// ========================================

/** キャッシュ: 2分 */
export const CACHE_2_MINUTES = MS_PER_MINUTE * 2;

/** キャッシュ: 5分 */
export const CACHE_5_MINUTES = MS_PER_MINUTE * 5;

/** キャッシュ: 10分 */
export const CACHE_10_MINUTES = MS_PER_MINUTE * 10;

/** キャッシュ: 30分 */
export const CACHE_30_MINUTES = MS_PER_MINUTE * 30;

/** キャッシュ: 1時間 */
export const CACHE_1_HOUR = MS_PER_HOUR;
