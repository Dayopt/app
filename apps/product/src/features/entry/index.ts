/**
 * Entry Feature - Public API
 *
 * docs: docs/product/specs/entry.md
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Types
// =============================================================================
export type { CalendarEvent } from './types/calendar-event';
export type { EntryWithTags } from './types/entry';
export type { LogEvent } from './types/log-event';
export type { PlanEvent, PlanEventStatus } from './types/plan-event';

// =============================================================================
// Hooks
// =============================================================================
export {
  useEntryMutations,
  useFindSkippableAutoRecords,
  useTimeModelRecordMutations,
  useTimeModelWriteMutations,
} from './hooks';

// =============================================================================
// Stores
// =============================================================================
export { useEntryInspectorStore } from './stores/useEntryInspectorStore';

// =============================================================================
// Lib (actual-time overlay)
// =============================================================================
export { computeActualTimeDiffOverlay, formatDiffMinutes } from './lib/actual-time-overlay';
export { entryTintColor } from './lib/entry-tint';

// =============================================================================
// Domain (Entry 時間モデル — 純粋関数、DB/tRPC/React 非依存)
// =============================================================================
export {
  buildTimeUpdateData,
  buildUndoTimeUpdateData,
  isPlannedEntry,
  isUnplannedEntry,
} from './domain';
export type { EntryLike } from './domain';
export {
  isPlanRecordDrop,
  isPlanTimeEditable,
  resolveTimeModelDestination,
} from './domain/time-model-destination';
export type { TimeModelDestination } from './domain/time-model-destination';

// =============================================================================
// Lib (entry-status utilities)
// =============================================================================
export { getEntryState } from './lib/entry-status';

// =============================================================================
// Lib (iCal export)
// =============================================================================
export { entriesToICal } from './lib/entry-to-ical';

// =============================================================================
// Lib (new entry animation tracker)
// =============================================================================
export { isNewEntry } from './lib/new-entry-tracker';

// =============================================================================
// Lib (entry menu items — 右クリック / Inspector メニュー共通の項目定義)
// =============================================================================
export { getEntryMenuItems } from './lib/entry-menu-items';
// =============================================================================
// Components (EntryCard)
// =============================================================================
export { EntryCard } from './components/card';
export type { EntryCardPosition } from './components/card';

// =============================================================================
// Components (time model 記録導線)
// =============================================================================
export { ConfirmDayButton, RecordPlanButton } from './components/time-model/TimeModelRecordActions';

// =============================================================================
// Components (Inspector fields — 他 feature から再利用可能な入力 row)
// =============================================================================
export { DateRow } from './components/inspector/fields/DateRow';
export { TimeConflictAlert } from './components/inspector/fields/TimeConflictAlert';
export { TimeRow } from './components/inspector/fields/TimeRow';

// ここにないものはfeature内部専用
