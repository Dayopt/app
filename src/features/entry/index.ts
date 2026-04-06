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
export {
  useBlockPlace,
  useEntries,
  useEntry,
  useEntryCreate,
  useEntryMutations,
  useEntryTags,
} from './hooks';

// =============================================================================
// Stores
// =============================================================================
export { useEntryInspectorStore } from './stores/useEntryInspectorStore';
export type { AnchorRect } from './stores/useEntryInspectorStore';

// =============================================================================
// Lib (actual-time overlay)
// =============================================================================
export {
  NO_OVERLAY,
  computeActualTimeDiffOverlay,
  computeEncroachments,
} from './lib/actual-time-overlay';
export type { ActualTimeDiffOverlay, Encroachment } from './lib/actual-time-overlay';

// =============================================================================
// Lib (entry-status utilities)
// =============================================================================
export { getEntryState, isEntryPast } from './lib/entry-status';

// =============================================================================
// Lib (iCal export)
// =============================================================================
export { entriesToICal } from './lib/entry-to-ical';

// =============================================================================
// Lib (new entry animation tracker)
// =============================================================================
export { isNewEntry } from './lib/new-entry-tracker';

// =============================================================================
// Components (EntryCard)
// =============================================================================
export { EntryCard, EntryCardContent } from './components/card';
export type { EntryCardPosition, EntryCardProps } from './components/card';

// =============================================================================
// Components
// =============================================================================
export { EntryInspector } from './components/inspector/EntryInspector';
export { LoadingState } from './components/shared/LoadingState';

// Inspector hooks
export { useInspectorKeyboard } from './components/inspector/hooks';

// =============================================================================
// Server (Service layer — for server-side consumers like ai feature)
// =============================================================================
export { EntryService } from './server/entry-service';
