import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database/generated/database.types';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import {
  getConfiguredGoogleCalendarProjectKey,
  resolveGoogleCalendarAuthorityIdentity,
} from './authority-config';
import { processCalendarRevokeOutbox, type CalendarRevokeOutboxSummary } from './revoke-outbox';
import { isValidEncryptionKey } from './token-crypto';

const EXPIRY_BATCH_SIZE = 250;
const MAINTENANCE_BATCH_SIZE = 250;
const ACCOUNT_INTENT_BATCH_SIZE = 20;
const DB_RPC_TIMEOUT_MS = 3_000;
const FINAL_READINESS_BUDGET_MS = 4_000;
const SIMPLE_STEP_BUDGET_MS = DB_RPC_TIMEOUT_MS + FINAL_READINESS_BUDGET_MS;
const INTENT_NORMALIZATION_BUDGET_MS = DB_RPC_TIMEOUT_MS * 2 + FINAL_READINESS_BUDGET_MS;

type RpcResponse<T> = {
  data: T;
  error: unknown;
};

export type CalendarAuthorityMaintenanceSummary = CalendarRevokeOutboxSummary & {
  encryptionAvailable: boolean;
  ciphertextsDeferred: number;
  guardsFinalized: number;
  expiredIntentsFound: number;
  expiredIntentsNormalized: number;
  revokeOperationsDeleted: number;
  commandReceiptsDeleted: number;
  oauthAttemptsDeleted: number;
  subjectFencesDeleted: number;
  pendingOperations: number;
  unboundConnections: number;
  unboundOutbox: number;
  cleanupHasMore: boolean;
  activated: boolean;
};

class CalendarAuthorityMaintenanceError extends Error {
  readonly code: string;

  constructor(operation: string) {
    super('Calendar authority maintenance failed');
    this.name = 'CalendarAuthorityMaintenanceError';
    this.code = `CALENDAR_AUTHORITY_${operation.toUpperCase()}_FAILED`;
  }
}

function maintenanceFailure(operation: string): CalendarAuthorityMaintenanceError {
  return new CalendarAuthorityMaintenanceError(operation);
}

async function callRpc<T>(
  operation: string,
  request: () => PromiseLike<RpcResponse<T>>,
): Promise<T> {
  try {
    const { data, error } = await request();
    if (error) throw maintenanceFailure(operation);
    return data;
  } catch (error) {
    if (error instanceof CalendarAuthorityMaintenanceError) throw error;
    throw maintenanceFailure(operation);
  }
}

function applyRevokeSummary(
  summary: CalendarAuthorityMaintenanceSummary,
  revoke: CalendarRevokeOutboxSummary,
): void {
  summary.claimed = revoke.claimed;
  summary.revoked = revoke.revoked;
  summary.retried = revoke.retried;
  summary.expired += revoke.expired;
  summary.alreadyGone = revoke.alreadyGone;
  summary.deadlineReached = revoke.deadlineReached;
}

async function readReadiness(
  db: SupabaseClient<Database>,
  identity: { projectKey: string; oauthClientId: string },
) {
  const readiness = await callRpc('readiness', () =>
    db
      .rpc('get_calendar_authority_readiness_v1', {
        p_project_key: identity.projectKey,
        p_oauth_client_id: identity.oauthClientId,
      })
      .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
  );
  const result = readiness?.[0];
  if (
    result === undefined ||
    typeof result.activated !== 'boolean' ||
    typeof result.pending_operations !== 'number' ||
    typeof result.unbound_connections !== 'number' ||
    typeof result.unbound_outbox !== 'number'
  ) {
    throw maintenanceFailure('readiness_result');
  }
  return result;
}

function applyReadiness(
  summary: CalendarAuthorityMaintenanceSummary,
  readiness: Awaited<ReturnType<typeof readReadiness>>,
): void {
  summary.activated = readiness.activated;
  summary.pendingOperations = readiness.pending_operations;
  summary.unboundConnections = readiness.unbound_connections;
  summary.unboundOutbox = readiness.unbound_outbox;
}

async function normalizeExpiredAccountDeletionIntents(
  db: SupabaseClient<Database>,
  projectKey: string,
  summary: CalendarAuthorityMaintenanceSummary,
): Promise<Error | null> {
  let intents: Array<{ user_id: string; deletion_id: string }>;
  try {
    const data = await callRpc('list_expired_intents', () =>
      db
        .rpc('list_expired_calendar_account_deletion_intents_v1', {
          p_project_key: projectKey,
          p_limit: ACCOUNT_INTENT_BATCH_SIZE,
        })
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
    );
    if (!Array.isArray(data)) throw maintenanceFailure('list_expired_intents_result');
    intents = data;
  } catch (error) {
    return error instanceof Error ? error : maintenanceFailure('list_expired_intents');
  }

  summary.expiredIntentsFound = intents.length;
  summary.cleanupHasMore ||= intents.length >= ACCOUNT_INTENT_BATCH_SIZE;

  // 各intentを別RPCにして、user単位writer lockを必ず別transactionで取得する。
  const normalizations = await Promise.allSettled(
    intents.map(async (intent) => {
      const result = await callRpc('normalize_expired_intent', () =>
        db
          .rpc('normalize_calendar_account_deletion_intent_v1', {
            p_project_key: projectKey,
            p_user_id: intent.user_id,
            p_deletion_id: intent.deletion_id,
          })
          .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
      );

      if (
        result !== 'missing' &&
        result !== 'ready' &&
        result !== 'active' &&
        result !== 'in_flight' &&
        result !== 'normalized'
      ) {
        throw maintenanceFailure('normalize_expired_intent_result');
      }
      return result;
    }),
  );

  let firstFailure: Error | null = null;
  for (const normalization of normalizations) {
    if (normalization.status === 'fulfilled') {
      if (normalization.value === 'normalized') summary.expiredIntentsNormalized += 1;
    } else {
      firstFailure ??= maintenanceFailure('normalize_expired_intent');
    }
  }
  return firstFailure;
}

function emptySummary(encryptionAvailable: boolean): CalendarAuthorityMaintenanceSummary {
  return {
    claimed: 0,
    revoked: 0,
    retried: 0,
    expired: 0,
    alreadyGone: 0,
    deadlineReached: false,
    encryptionAvailable,
    ciphertextsDeferred: 0,
    guardsFinalized: 0,
    expiredIntentsFound: 0,
    expiredIntentsNormalized: 0,
    revokeOperationsDeleted: 0,
    commandReceiptsDeleted: 0,
    oauthAttemptsDeleted: 0,
    subjectFencesDeleted: 0,
    pendingOperations: 0,
    unboundConnections: 0,
    unboundOutbox: 0,
    cleanupHasMore: false,
    activated: false,
  };
}

function reserveDeadlineBudget(
  summary: CalendarAuthorityMaintenanceSummary,
  deadlineAt: number,
  requiredMs: number,
): boolean {
  if (deadlineAt - Date.now() >= requiredMs) return true;

  summary.deadlineReached = true;
  summary.cleanupHasMore = true;
  return false;
}

/**
 * Calendar 固有のprovider revoke、guard finalization、期限切れdeletion intent、
 * receipt/fence retention、readinessを1つのfeature境界で処理する。
 *
 * hard expiry が失敗したrunでは新しいprovider callを始めない。他の独立した保守処理は
 * 可能な限り続け、最初の安全化済みfailureを最後に返す。
 */
export async function processCalendarAuthorityMaintenance(params: {
  deadlineAt: number;
}): Promise<CalendarAuthorityMaintenanceSummary> {
  const { deadlineAt } = params;
  const encryptionKey = env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  const summary = emptySummary(isValidEncryptionKey(encryptionKey));

  let db: SupabaseClient<Database>;
  try {
    db = createServiceRoleClient();
  } catch {
    throw maintenanceFailure('client');
  }

  const projectKey = getConfiguredGoogleCalendarProjectKey();
  const identity = resolveGoogleCalendarAuthorityIdentity();
  if (projectKey === null) throw maintenanceFailure('identity');

  let firstFailure: Error | null = null;
  let expirySucceeded = false;
  let providerIdentity: typeof identity = null;

  try {
    const expiry = await callRpc('expire', () =>
      db
        .rpc('expire_calendar_revoke_authority_v3', {
          p_project_key: projectKey,
          p_limit: EXPIRY_BATCH_SIZE,
        })
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
    );
    const result = expiry?.[0];
    if (
      result === undefined ||
      typeof result.ciphertexts_deleted !== 'number' ||
      typeof result.ciphertexts_deferred !== 'number'
    ) {
      throw maintenanceFailure('expire_result');
    }
    summary.expired += result.ciphertexts_deleted;
    summary.ciphertextsDeferred = result.ciphertexts_deferred;
    summary.cleanupHasMore ||=
      result.ciphertexts_deleted >= EXPIRY_BATCH_SIZE || result.ciphertexts_deferred > 0;
    expirySucceeded = true;
  } catch (error) {
    firstFailure ??= error instanceof Error ? error : maintenanceFailure('expire');
  }

  if (identity === null) {
    firstFailure ??= maintenanceFailure('identity');
  } else if (expirySucceeded) {
    try {
      // Envの自己整合だけでproviderへ進まない。DBに固定した完全なOAuth client identityを
      // provider HTTPの前に検証し、response後のreadinessだけに依存しない。
      applyReadiness(summary, await readReadiness(db, identity));
      providerIdentity = identity;
    } catch (error) {
      firstFailure ??= error instanceof Error ? error : maintenanceFailure('readiness');
    }
  }

  if (providerIdentity !== null && summary.encryptionAvailable && encryptionKey !== undefined) {
    try {
      const revoke = await processCalendarRevokeOutbox({
        db,
        projectKey: providerIdentity.projectKey,
        encryptionKey,
        deadlineAt,
      });
      applyRevokeSummary(summary, revoke);
    } catch {
      firstFailure ??= maintenanceFailure('revoke_outbox');
    }
  }

  if (reserveDeadlineBudget(summary, deadlineAt, SIMPLE_STEP_BUDGET_MS)) {
    try {
      const finalized = await callRpc('finalize_guards', () =>
        db
          .rpc('finalize_calendar_revoke_guards_v1', {
            p_project_key: projectKey,
            p_limit: MAINTENANCE_BATCH_SIZE,
          })
          .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
      );
      if (typeof finalized !== 'number') throw maintenanceFailure('finalize_guards_result');
      summary.guardsFinalized = finalized;
      summary.cleanupHasMore ||= finalized >= MAINTENANCE_BATCH_SIZE;
    } catch (error) {
      firstFailure ??= error instanceof Error ? error : maintenanceFailure('finalize_guards');
    }
  }

  if (reserveDeadlineBudget(summary, deadlineAt, INTENT_NORMALIZATION_BUDGET_MS)) {
    const normalizationFailure = await normalizeExpiredAccountDeletionIntents(
      db,
      projectKey,
      summary,
    );
    firstFailure ??= normalizationFailure;
  }

  if (reserveDeadlineBudget(summary, deadlineAt, SIMPLE_STEP_BUDGET_MS)) {
    try {
      const deleted = await callRpc('cleanup_operations', () =>
        db
          .rpc('cleanup_calendar_revoke_operations_v1', {
            p_project_key: projectKey,
            p_limit: MAINTENANCE_BATCH_SIZE,
          })
          .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
      );
      if (typeof deleted !== 'number') throw maintenanceFailure('cleanup_operations_result');
      summary.revokeOperationsDeleted = deleted;
      summary.cleanupHasMore ||= deleted >= MAINTENANCE_BATCH_SIZE;
    } catch (error) {
      firstFailure ??= error instanceof Error ? error : maintenanceFailure('cleanup_operations');
    }
  }

  if (reserveDeadlineBudget(summary, deadlineAt, SIMPLE_STEP_BUDGET_MS)) {
    try {
      const retention = await callRpc('cleanup_retention', () =>
        db
          .rpc('cleanup_calendar_authority_retention_v1', {
            p_project_key: projectKey,
            p_limit: MAINTENANCE_BATCH_SIZE,
          })
          .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
      );
      const result = retention?.[0];
      if (
        result === undefined ||
        typeof result.command_receipts_deleted !== 'number' ||
        typeof result.oauth_attempts_deleted !== 'number' ||
        typeof result.subject_fences_deleted !== 'number'
      ) {
        throw maintenanceFailure('cleanup_retention_result');
      }
      summary.commandReceiptsDeleted = result.command_receipts_deleted;
      summary.oauthAttemptsDeleted = result.oauth_attempts_deleted;
      summary.subjectFencesDeleted = result.subject_fences_deleted;
      summary.cleanupHasMore ||=
        result.command_receipts_deleted >= MAINTENANCE_BATCH_SIZE ||
        result.oauth_attempts_deleted >= MAINTENANCE_BATCH_SIZE ||
        result.subject_fences_deleted >= MAINTENANCE_BATCH_SIZE;
    } catch (error) {
      firstFailure ??= error instanceof Error ? error : maintenanceFailure('cleanup_retention');
    }
  }

  if (identity !== null && reserveDeadlineBudget(summary, deadlineAt, FINAL_READINESS_BUDGET_MS)) {
    try {
      applyReadiness(summary, await readReadiness(db, identity));
    } catch (error) {
      firstFailure ??= error instanceof Error ? error : maintenanceFailure('readiness');
    }
  }

  if (firstFailure !== null) throw firstFailure;
  return summary;
}
