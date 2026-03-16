/**
 * Entry Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Types
// =============================================================================
export type {
  CreateEntryInput,
  Entry,
  EntryFilters,
  EntryOrigin,
  EntryWithTags,
  FulfillmentScore,
  RecurrenceConfig,
  RecurrenceType,
  UpdateEntryInput,
} from './types/entry';

// =============================================================================
// Schemas (Zod validation)
// =============================================================================
export {
  bulkDeleteEntrySchema,
  bulkUpdateEntrySchema,
  createEntrySchema,
  entryFilterSchema,
  entryIdSchema,
  entryOriginSchema,
  fulfillmentScoreSchema,
  getEntryByIdSchema,
  recurrenceTypeSchema,
  updateEntrySchema,
} from './schemas/entry';
export type { EntryFilter, GetEntryByIdInput } from './schemas/entry';

// =============================================================================
// Hooks
// =============================================================================
export { useEntries } from './hooks/useEntries';
export { useEntry } from './hooks/useEntry';
export { useEntryCreate } from './hooks/useEntryCreate';
export { useEntryInstanceMutations, useEntryInstances } from './hooks/useEntryInstances';
export { useEntryMutations } from './hooks/useEntryMutations';
export { useRecurringScopeMutations } from './hooks/useRecurringScopeMutations';

// =============================================================================
// Stores
// =============================================================================
export { useEntryCacheStore } from './stores/useEntryCacheStore';
export { useEntryInspectorStore } from './stores/useEntryInspectorStore';
export type { AnchorRect } from './stores/useEntryInspectorStore';

// =============================================================================
// Lib (actual-time overlay)
// =============================================================================
export { NO_OVERLAY, computeActualTimeDiffOverlay } from './lib/actual-time-overlay';
export type { ActualTimeDiffOverlay } from './lib/actual-time-overlay';

// =============================================================================
// Lib (entry-status utilities)
// =============================================================================
export type { EntryState } from '@/types/entry';
export {
  computeOriginTransition,
  getEntryState,
  isEntryPast,
  isTimePast,
} from './lib/entry-status';

// =============================================================================
// Lib (recurrence utilities)
// =============================================================================
export {
  expandRecurrence,
  getEntryRecurrenceConfig,
  isRecurringEntry,
} from './lib/entry-recurrence';
export type { EntryInstanceException, ExpandedOccurrence } from './lib/entry-recurrence';
export { configToRRule, configToReadable, ruleToConfig } from './lib/rrule';

// =============================================================================
// Lib (instance-id utilities)
// =============================================================================
export { decodeInstanceId, encodeInstanceId, getInstanceRef } from './lib/instance-id';
export type { InstanceRefSource, RecurrenceInstanceRef } from './lib/instance-id';

// =============================================================================
// Components (EntryCard)
// =============================================================================
export { EntryCard, EntryCardContent } from './components/card';
export type { EntryCardPosition, EntryCardProps } from './components/card';

// =============================================================================
// Components
// =============================================================================
export { EntryDeleteConfirmDialog } from './components/EntryDeleteConfirmDialog';
export { EntryInspector } from './components/inspector/EntryInspector';
export { RecurringEditConfirmDialog } from './components/RecurringEditConfirmDialog';
export type { RecurringEditScope } from './components/RecurringEditConfirmDialog';
export { EntryCreateTrigger } from './components/shared/EntryCreateTrigger';
export { LoadingState } from './components/shared/LoadingState';

// Inspector hooks
export { useInspectorKeyboard } from './components/inspector/hooks';
