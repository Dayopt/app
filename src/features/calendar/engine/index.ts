/**
 * Calendar Engine — React/DOM依存ゼロの純粋関数層
 *
 * カレンダーの計算ロジックを提供。すべての関数は副作用を持たず、
 * テスト容易性・Server Component利用・Web Worker移動が可能。
 */

// Grid: time↔pixel変換、スナップ、グリッド寸法
export {
  DEFAULT_HOUR_HEIGHT,
  MIN_EVENT_HEIGHT,
  calculateGridHeight,
  calculateScrollPosition,
  computeEntryStyles,
  generateTimeSlots,
  getDurationInMinutes,
  getEventStyle,
  isTimeInRange,
  pixelsToTime,
  pixelsToTimeValues,
  roundToQuarterHour,
  timeToPixels,
} from './grid';
export type { EntryPositionInput, EventStyle, TimeSlot } from './grid';

// Layout: 重複検出、カラム割り当て、エントリカード配置
export {
  calculateEntryLayouts,
  calculateEntryPosition,
  calculateEntryPositionWithCollapse,
  calculateGroupLayout,
  calculateMaxConcurrent,
  computeActualTimeDiffOverlay,
  detectOverlapGroups,
  entriesOverlap,
  filterEntriesByDate,
  findOverlapGroups,
  isOverlapping,
  sortTimedEntries,
} from './layout';
export type { ActualTimeDiffOverlay, EntryLayout } from './layout';

// Overlap: ドラッグ時の重複判定
export { checkClientSideOverlap } from './overlap';

// Range: 日付範囲計算、ピリオド移動
export { calculateViewDateRange, getNextPeriod, getPreviousPeriod } from './range';

// Temporal: エントリ状態判定
export { computeOriginTransition, getEntryState, isEntryPast, isTimePast } from './temporal';
export type { EntryState } from './temporal';
