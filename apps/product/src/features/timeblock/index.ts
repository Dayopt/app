/**
 * Timeblock Feature - Public API
 *
 * docs: docs/product/specs/plan-record.md
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Types
// =============================================================================
export type { CalendarEvent } from './types/calendar-event';
export type { PlanEvent, PlanEventStatus } from './types/plan-event';
export type { RecordEvent } from './types/record-event';

// =============================================================================
// Hooks
// =============================================================================
export { useTimeblockRecordMutations, useTimeblockWriteMutations } from './hooks';

// =============================================================================
// Stores
// =============================================================================
export { useTimeblockInspectorStore } from './stores/useTimeblockInspectorStore';

// =============================================================================
// Lib (actual-time overlay)
// =============================================================================
export { computeActualTimeDiffOverlay, formatDiffMinutes } from './lib/actual-time-overlay';
export { timeblockTintColor } from './lib/timeblock-tint';

// =============================================================================
// Domain (時間モデル — 純粋関数、DB/tRPC/React 非依存)
// =============================================================================
export { isPlanRecordDrop, resolveTimeblockDestination } from './domain/timeblock-destination';
export type { TimeblockDestination } from './domain/timeblock-destination';

// =============================================================================
// Lib (iCal export)
// =============================================================================
export { plansToICal } from './lib/plan-to-ical';

// =============================================================================
// Lib (new timeblock animation tracker)
// =============================================================================
export { isNewTimeblock } from './lib/new-timeblock-tracker';

// =============================================================================
// Lib (timeblock menu items — 右クリック / Inspector メニュー共通の項目定義)
// =============================================================================
export { getTimeblockMenuItems } from './lib/timeblock-menu-items';
// =============================================================================
// Components (TimeblockCard)
// =============================================================================
export { TimeblockCard } from './components/card';
export type { TimeblockCardPosition } from './components/card';

// =============================================================================
// Components (記録導線)
// =============================================================================
export { ConfirmDayButton } from './components/editor/TimeblockRecordActions';

// =============================================================================
// Components (Inspector fields — 他 feature から再利用可能な入力 row)
// =============================================================================
export { DateRow } from './components/inspector/fields/DateRow';
export { TimeConflictAlert } from './components/inspector/fields/TimeConflictAlert';
export { TimeRow } from './components/inspector/fields/TimeRow';

// ここにないものはfeature内部専用
