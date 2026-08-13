import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';

/** Postgres/PostgREST codes for "relation does not exist". */
const RELATION_MISSING_CODES = new Set(['PGRST205', '42P01']);

/** Allow-result cache: only "fence is disabled" is cached, never a block or an error. */
const ALLOW_CACHE_TTL_MS = 5_000;
let allowCacheExpiresAt = 0;

function hasPostgrestCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * Checks the write_fence_control singleton row using the caller's own Supabase client
 * (tRPC mutations pass `ctx.supabase`, webhooks pass their service-role client). This keeps
 * the fence's failure domain identical to the write's own failure domain — a client that
 * cannot read write_fence_control also cannot perform the write it would have gated, so
 * fail-closed does not introduce a new single point of failure.
 *
 * Fails closed (returns true = blocked) on any error or missing row, except when the
 * relation itself does not exist yet (PGRST205 / 42P01) — that state occurs only during the
 * brief migration/deploy race window before this table exists, and treating it as blocking
 * would take down all mutations on every deploy that adds a new migration.
 */
export async function isWriteFenceEnabled(supabase: SupabaseClient<Database>): Promise<boolean> {
  if (Date.now() < allowCacheExpiresAt) return false;

  const { data, error } = await supabase
    .from(databaseTables.writeFenceControl)
    .select('fence_enabled')
    .eq('singleton_key', true)
    .maybeSingle();

  if (error) {
    if (hasPostgrestCode(error) && RELATION_MISSING_CODES.has(error.code)) {
      captureUnexpectedDatabaseError(error, {
        feature: 'ops',
        operation: 'check_write_fence_relation_missing',
      });
      logger.warn('write_fence_control relation does not exist yet; treating fence as disabled');
      return false;
    }

    captureUnexpectedDatabaseError(error, { feature: 'ops', operation: 'check_write_fence' });
    logger.error('Write fence check failed; failing closed (blocking writes)');
    return true;
  }

  if (!data) {
    captureUnexpectedDatabaseError(new Error('write_fence_control row is missing'), {
      feature: 'ops',
      operation: 'check_write_fence',
    });
    logger.error('write_fence_control row is missing; failing closed (blocking writes)');
    return true;
  }

  if (!data.fence_enabled) {
    allowCacheExpiresAt = Date.now() + ALLOW_CACHE_TTL_MS;
    return false;
  }

  return true;
}

/** Test-only: clears the in-process allow cache so test cases don't leak state into each other. */
export function resetWriteFenceCacheForTestsOnly(): void {
  allowCacheExpiresAt = 0;
}
