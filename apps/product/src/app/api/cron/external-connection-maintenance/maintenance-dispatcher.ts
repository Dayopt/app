import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import {
  processCalendarRevokeOutbox,
  type CalendarRevokeOutboxSummary,
} from '@/features/external-calendar/server/revoke-outbox';
import type { Database } from '@/lib/database/generated/database.types';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

const CLEANUP_BATCH_SIZE = 250;
const DB_RPC_TIMEOUT_MS = 3_000;
const RETENTION_BUDGET_MS = 23_000;

type RetentionSummary = {
  authorizationCodesDeleted: number;
  accessTokensDeleted: number;
  refreshTokensDeleted: number;
  connectionsDeleted: number;
  receiptsDeleted: number;
  securityEventsDeleted: number;
  hasMore: boolean;
};

type PublicOutboxSummary = Omit<
  CalendarRevokeOutboxSummary,
  'encryptionAvailable' | 'deadlineReached'
> & {
  due: number;
  total: number;
  oldestDueAgeSeconds: number;
  deferred: number;
  revokeUnavailable: boolean;
};

type ExternalConnectionMaintenanceSummary = {
  complete: boolean;
  outbox: PublicOutboxSummary;
  retention: RetentionSummary;
  durationMs: number;
};

type CleanupFunction =
  | 'cleanup_oauth_authorization_codes_v1'
  | 'cleanup_oauth_access_tokens_v1'
  | 'cleanup_oauth_refresh_tokens_v1'
  | 'cleanup_oauth_connections_v1'
  | 'cleanup_mcp_mutation_receipts_v1'
  | 'cleanup_integration_security_events_v1';

class ExternalConnectionMaintenanceError extends Error {
  readonly code: string;

  constructor(operation: string) {
    super('External connection maintenance failed');
    this.name = 'ExternalConnectionMaintenanceError';
    this.code = `EXTERNAL_CONNECTION_${operation.toUpperCase()}_FAILED`;
  }
}

async function cleanup(db: SupabaseClient<Database>, operation: CleanupFunction): Promise<number> {
  try {
    const { data, error } = await db
      .rpc(operation, { p_limit: CLEANUP_BATCH_SIZE })
      .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
    if (error || typeof data !== 'number') {
      throw new ExternalConnectionMaintenanceError(operation);
    }
    return data;
  } catch (error) {
    if (error instanceof ExternalConnectionMaintenanceError) throw error;
    throw new ExternalConnectionMaintenanceError(operation);
  }
}

async function readStatus(db: SupabaseClient<Database>) {
  try {
    const { data, error } = await db
      .rpc('get_external_authority_maintenance_status_v1')
      .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
    const status = data?.[0];
    if (error || status === undefined) {
      throw new ExternalConnectionMaintenanceError('status');
    }
    return status;
  } catch (error) {
    if (error instanceof ExternalConnectionMaintenanceError) throw error;
    throw new ExternalConnectionMaintenanceError('status');
  }
}

/**
 * Calendar provider revoke と OAuth authority retention を 1 本の cron で実行する。
 *
 * outbox 側が失敗しても retention は試す。逆も同様で、1 種類の cleanup failure が他の
 * 保持期限を無期限に延ばさないよう、最初の安全化済み error だけを最後に再送出する。
 */
export async function dispatchExternalConnectionMaintenance(params: {
  deadlineAt: number;
}): Promise<ExternalConnectionMaintenanceSummary> {
  const startedAt = Date.now();
  let db: SupabaseClient<Database>;
  try {
    db = createServiceRoleClient();
  } catch {
    throw new ExternalConnectionMaintenanceError('client');
  }
  let firstFailure: Error | null = null;
  let outbox: CalendarRevokeOutboxSummary = {
    claimed: 0,
    revoked: 0,
    retried: 0,
    expired: 0,
    alreadyGone: 0,
    deadlineReached: false,
    encryptionAvailable: false,
  };

  try {
    outbox = await processCalendarRevokeOutbox({
      encryptionKey: env.CALENDAR_TOKEN_ENCRYPTION_KEY,
      deadlineAt: params.deadlineAt - RETENTION_BUDGET_MS,
    });
  } catch {
    // feature 側は安全化済み error を返すが、将来の変更でも raw DB/provider error を
    // route / Sentry へ通さないよう Composition Layer でも固定メッセージへ置き換える。
    firstFailure = new ExternalConnectionMaintenanceError('outbox');
  }

  const retention: Omit<RetentionSummary, 'hasMore'> = {
    authorizationCodesDeleted: 0,
    accessTokensDeleted: 0,
    refreshTokensDeleted: 0,
    connectionsDeleted: 0,
    receiptsDeleted: 0,
    securityEventsDeleted: 0,
  };

  const cleanupSteps: ReadonlyArray<{
    key: keyof typeof retention;
    operation: CleanupFunction;
  }> = [
    {
      key: 'authorizationCodesDeleted',
      operation: 'cleanup_oauth_authorization_codes_v1',
    },
    { key: 'accessTokensDeleted', operation: 'cleanup_oauth_access_tokens_v1' },
    { key: 'refreshTokensDeleted', operation: 'cleanup_oauth_refresh_tokens_v1' },
    { key: 'receiptsDeleted', operation: 'cleanup_mcp_mutation_receipts_v1' },
    { key: 'connectionsDeleted', operation: 'cleanup_oauth_connections_v1' },
    {
      key: 'securityEventsDeleted',
      operation: 'cleanup_integration_security_events_v1',
    },
  ];

  for (const step of cleanupSteps) {
    try {
      retention[step.key] = await cleanup(db, step.operation);
    } catch (error) {
      firstFailure ??=
        error instanceof Error ? error : new ExternalConnectionMaintenanceError(step.operation);
    }
  }

  let status: Awaited<ReturnType<typeof readStatus>>;
  try {
    status = await readStatus(db);
  } catch (error) {
    firstFailure ??=
      error instanceof Error ? error : new ExternalConnectionMaintenanceError('status');
    throw firstFailure;
  }

  if (firstFailure !== null) throw firstFailure;

  const hasMore =
    status.authorization_codes_due ||
    status.access_tokens_due ||
    status.refresh_tokens_due ||
    status.connections_due ||
    status.receipts_due ||
    status.security_events_due;
  const revokeUnavailable = !outbox.encryptionAvailable && status.calendar_revoke_total > 0;
  const complete =
    outbox.expired === 0 &&
    outbox.retried === 0 &&
    !outbox.deadlineReached &&
    status.calendar_revoke_total === 0 &&
    !hasMore;

  const summary: ExternalConnectionMaintenanceSummary = {
    complete,
    outbox: {
      claimed: outbox.claimed,
      revoked: outbox.revoked,
      retried: outbox.retried,
      expired: outbox.expired,
      alreadyGone: outbox.alreadyGone,
      due: status.calendar_revoke_due,
      total: status.calendar_revoke_total,
      oldestDueAgeSeconds: status.oldest_due_age_seconds,
      deferred: status.calendar_revoke_due,
      revokeUnavailable,
    },
    retention: {
      ...retention,
      hasMore,
    },
    durationMs: Date.now() - startedAt,
  };

  logger.info('[external-connection-maintenance] dispatch finished', summary);
  return summary;
}
