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
  EntryState,
  EntryWithTags,
  FulfillmentScore,
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
  updateEntrySchema,
} from './schemas/entry';
export type { EntryFilter, GetEntryByIdInput } from './schemas/entry';

// =============================================================================
// Hooks
// =============================================================================
export { useEntries, useEntry, useEntryCreate, useEntryMutations } from './hooks';

// =============================================================================
// Stores
// =============================================================================
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
export { getEntryState, isEntryPast } from './lib/entry-status';

// =============================================================================
// Lib (iCal export)
// =============================================================================
export { entriesToICal } from './lib/entry-to-ical';

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
export { EntryCreateTrigger } from './components/shared/EntryCreateTrigger';
export { LoadingState } from './components/shared/LoadingState';

// Inspector hooks
export { useInspectorKeyboard } from './components/inspector/hooks';
