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
  EntryOrigin,
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

// =============================================================================
// Hooks
// =============================================================================
export { useBlockPlace, useEntries, useEntryMutations } from './hooks';

// =============================================================================
// Stores
// =============================================================================
export { useEntryInspectorStore } from './stores/useEntryInspectorStore';

// =============================================================================
// Lib (actual-time overlay)
// =============================================================================
export { NO_OVERLAY, computeActualTimeDiffOverlay } from './lib/actual-time-overlay';
export type { ActualTimeDiffOverlay } from './lib/actual-time-overlay';

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
// Components (EntryCard)
// =============================================================================
export { EntryCard } from './components/card';
export type { EntryCardPosition, EntryCardProps } from './components/card';

// =============================================================================
// Components (Inspector fields — 他 feature から再利用可能な入力 row)
// =============================================================================
export { DateRow } from './components/inspector/fields/DateRow';
export { TimeRow } from './components/inspector/fields/TimeRow';
export { TimeSelect } from './components/inspector/fields/TimeSelect';

// =============================================================================
// Server (Service layer — server-only ガードで保護済み)
// =============================================================================
export { EntryService } from './server/entry-service';

// ここにないものはfeature内部専用
