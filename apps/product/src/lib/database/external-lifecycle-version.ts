import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceRoleClient } from '@/lib/supabase/oauth';

import type { Database } from './generated/database.types';

const PREDECESSOR_MISSING_FUNCTION_CODES = new Set(['42883', 'PGRST202']);
/** cron route の予算不等式（`SETTLE_WORST_CASE_MS` 等）が導出に使うため export する。 */
export const VERSION_RPC_TIMEOUT_MS = 3_000;

type DatabaseError = {
  code?: unknown;
};

export function isPredecessorMissingFunction(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as DatabaseError).code;
  return typeof code === 'string' && PREDECESSOR_MISSING_FUNCTION_CODES.has(code);
}

/**
 * Candidate 3 terminal marker.
 *
 * The marker is the final migration in the chain. Its exact absence means an
 * older or partially-applied schema, so the app may use only the predecessor
 * behavior. Any other database failure is indeterminate and fails closed.
 */
export async function getExternalLifecycleAppVersion(db: SupabaseClient<Database>): Promise<0 | 1> {
  const { data, error } = await db
    .rpc('get_external_lifecycle_app_version_v2')
    .abortSignal(AbortSignal.timeout(VERSION_RPC_TIMEOUT_MS));

  if (error) {
    if (isPredecessorMissingFunction(error)) return 0;
    throw new Error('External lifecycle schema version could not be verified');
  }

  if (data !== 1) {
    throw new Error('External lifecycle schema version is inconsistent');
  }

  return data;
}

export function getConfiguredExternalLifecycleAppVersion(): Promise<0 | 1> {
  return getExternalLifecycleAppVersion(createServiceRoleClient());
}
