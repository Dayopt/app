import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import {
  processCalendarRevokeOutbox,
  type CalendarRevokeOutboxSummary,
} from '@/features/external-calendar/server/revoke-outbox';
import { cleanupBillingAccountDeletionTerminalReceipts } from '@/features/settings/server/account-deletion';
import { cleanupBillingMutationClaims } from '@/features/settings/server/billing-mutation-service';
import { getExternalLifecycleAppVersion } from '@/lib/database/external-lifecycle-version';
import type { Database } from '@/lib/database/generated/database.types';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

const CLEANUP_BATCH_SIZE = 250;
const DB_RPC_TIMEOUT_MS = 3_000;
const RETENTION_BUDGET_MS = 23_000;

/**
 * どの retention 区分に期限超過 backlog が残っているか。`hasMore` が true の時に
 * 「何が残っているか」を ID 抜きで示し、cron の warn ログを識別可能にする。
 */
type RetentionDueSummary = {
  authorizationCodes: boolean;
  accessTokens: boolean;
  refreshTokens: boolean;
  connections: boolean;
  receipts: boolean;
  securityEvents: boolean;
  billingClaims: boolean;
  billingDeletionReceipts: boolean;
};

type RetentionSummary = {
  billingClaimsDeleted: number;
  billingDeletionReceiptsDeleted: number;
  billingProviderResponsesRedacted: number;
  securityEventsDeleted: number;
  mcpMutationReceiptsDeleted: number;
  due: RetentionDueSummary;
  hasMore: boolean;
};

const NO_RETENTION_DUE: RetentionDueSummary = {
  authorizationCodes: false,
  accessTokens: false,
  refreshTokens: false,
  connections: false,
  receipts: false,
  securityEvents: false,
  billingClaims: false,
  billingDeletionReceipts: false,
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
  'cleanup_integration_security_events_v1' | 'cleanup_mcp_mutation_receipts_v1';

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
 * Calendar provider revoke と外部依存 retention を 1 本の cron で実行する。
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

  const lifecycleVersion = await getExternalLifecycleAppVersion(db);
  if (lifecycleVersion === 0) {
    const predecessorSummary: ExternalConnectionMaintenanceSummary = {
      complete: true,
      outbox: {
        claimed: 0,
        revoked: 0,
        retried: 0,
        expired: 0,
        alreadyGone: 0,
        due: 0,
        total: 0,
        oldestDueAgeSeconds: 0,
        deferred: 0,
        revokeUnavailable: false,
      },
      retention: {
        billingClaimsDeleted: 0,
        billingDeletionReceiptsDeleted: 0,
        billingProviderResponsesRedacted: 0,
        securityEventsDeleted: 0,
        mcpMutationReceiptsDeleted: 0,
        due: NO_RETENTION_DUE,
        hasMore: false,
      },
      durationMs: Date.now() - startedAt,
    };
    logger.info(
      '[external-connection-maintenance] predecessor schema; maintenance deferred',
      predecessorSummary,
    );
    return predecessorSummary;
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

  const retention: Omit<RetentionSummary, 'due' | 'hasMore'> = {
    billingClaimsDeleted: 0,
    billingDeletionReceiptsDeleted: 0,
    billingProviderResponsesRedacted: 0,
    securityEventsDeleted: 0,
    mcpMutationReceiptsDeleted: 0,
  };

  // NOTE: authorization_codes / access_tokens / refresh_tokens / connections 用の
  // cleanup_oauth_*_v1 RPC はまだ存在しない（status RPC が due flag を返すだけで、対応する
  // cleanup 関数が未実装。#1898 で実装する）。存在しない RPC を呼ぶと cron が恒久的に失敗
  // するため、ここでは実在する cleanup_mcp_mutation_receipts_v1 だけを足す。4 種の due flag
  // は hasMore / complete へ組み込んで fail closed にする（complete: true と due flag: true
  // が同時に立つのは step-6-execution-checklist.md の Stop condition に当たる）。
  // #1898 が入るまで complete は false のまま固着しうるため、どの区分が残っているかを
  // retention.due として summary に出し、warn ログを識別可能に保つ。
  const cleanupSteps: ReadonlyArray<{
    key: keyof typeof retention;
    operation: CleanupFunction;
  }> = [
    {
      key: 'securityEventsDeleted',
      operation: 'cleanup_integration_security_events_v1',
    },
    {
      key: 'mcpMutationReceiptsDeleted',
      operation: 'cleanup_mcp_mutation_receipts_v1',
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

  let billingMutationHasMore = false;
  try {
    const billingMutation = await cleanupBillingMutationClaims(db, {
      limit: CLEANUP_BATCH_SIZE,
    });
    retention.billingClaimsDeleted = billingMutation.claimsDeleted;
    retention.billingProviderResponsesRedacted = billingMutation.providerResponsesRedacted;
    billingMutationHasMore = billingMutation.hasMore;
  } catch {
    firstFailure ??= new ExternalConnectionMaintenanceError('billing_mutation_cleanup');
  }

  let billingDeletionReceiptsHaveMore = false;
  try {
    const billingDeletionReceipts = await cleanupBillingAccountDeletionTerminalReceipts(db, {
      limit: CLEANUP_BATCH_SIZE,
    });
    retention.billingDeletionReceiptsDeleted = billingDeletionReceipts.deleted;
    billingDeletionReceiptsHaveMore = billingDeletionReceipts.hasMore;
  } catch {
    firstFailure ??= new ExternalConnectionMaintenanceError('billing_deletion_receipt_cleanup');
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

  const due: RetentionDueSummary = {
    authorizationCodes: status.authorization_codes_due,
    accessTokens: status.access_tokens_due,
    refreshTokens: status.refresh_tokens_due,
    connections: status.connections_due,
    receipts: status.receipts_due,
    securityEvents: status.security_events_due,
    billingClaims: billingMutationHasMore,
    billingDeletionReceipts: billingDeletionReceiptsHaveMore,
  };
  const hasMore = Object.values(due).some(Boolean);
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
      due,
      hasMore,
    },
    durationMs: Date.now() - startedAt,
  };

  logger.info('[external-connection-maintenance] dispatch finished', summary);
  return summary;
}
