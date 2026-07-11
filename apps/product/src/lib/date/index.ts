/**
 * 日付ユーティリティライブラリ
 *
 * `@/lib/date` 経由で実際に参照されている API のみ re-export。
 * deep import (`@/lib/date/core`, `@/lib/date/format`, `@/lib/date/timezone`,
 * `@/lib/date/constants`, `@/lib/date/filter`) も並行して利用可能。
 */

// ========================================
// Core - 基本的な日付計算
// ========================================
export {
  addDays,
  addMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  generateDateRange,
  getDateKey,
  getDaysDifference,
  isSameDay,
  isToday,
  isWeekend,
  normalizeDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from './core';

// ========================================
// Format - フォーマット
// ========================================
export { formatTime, formatTimeRange } from './format';

// ========================================
// TimeString - "HH:mm" パース / フォーマット
// ========================================
export { formatHHmm, formatTimeString, parseTimeString } from './timeString';

// ========================================
// Filter - 日付範囲フィルター（type のみ）
// ========================================
export type { DateRangeFilter } from './filter';

// ========================================
// 定数の再エクスポート
// ========================================
export { CACHE_5_MINUTES, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './constants';
