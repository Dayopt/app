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

/**
 * fenced calendar sync writer terminal marker（v3、#2050）。
 *
 * Candidate 3（`get_external_lifecycle_app_version_v2`、上記）とは**独立した**
 * migration chain の完了を表す。既存の `getExternalLifecycleAppVersion` を widen
 * すると、settings/billing・cron dispatcher 等の無関係な既存呼び出し元が全て
 * 「RPC を 2 回呼ぶ」新しい contract に巻き込まれ、それらの mock ベース test が
 * 軒並み壊れる（実測: #2050 実装時、5+ ファイルが regression）。そのため sync-service.ts /
 * connection-service.ts だけが読む専用関数として分離する
 * （docs/projects/external-calendar-fenced-writer-migration/overview.md §0 改訂）。
 *
 * v3 marker が無ければ fenced sync writer RPC 群（`begin_calendar_sync_run_v1` 等、
 * `20260730090017_fenced_calendar_sync_writers.sql`）と `partial_timeout` allowlist
 * （#2078、`20260820120000_extend_calendar_sync_error_allowlist.sql`）のどちらか、
 * または両方が未適用とみなし、呼び出し側は v0/v1 相当の挙動（既存の直接書き込みパス）へ
 * fall back する。
 */
export async function isFencedCalendarSyncWriterReady(
  db: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } = await db
    .rpc('get_external_lifecycle_app_version_v3')
    .abortSignal(AbortSignal.timeout(VERSION_RPC_TIMEOUT_MS));

  if (error) {
    if (isPredecessorMissingFunction(error)) return false;
    throw new Error('Fenced calendar sync writer schema version could not be verified');
  }

  if (data !== 2) {
    throw new Error('Fenced calendar sync writer schema version is inconsistent');
  }

  return true;
}

export function isConfiguredFencedCalendarSyncWriterReady(): Promise<boolean> {
  return isFencedCalendarSyncWriterReady(createServiceRoleClient());
}
