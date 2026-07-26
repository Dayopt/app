import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database/generated/database.types';
import { captureUnexpectedError } from '@/lib/sentry';

import { googleCalendarAdapter } from './providers/google';
import { decryptToken } from './token-crypto';

/**
 * purge 後に残した revoke-only refresh token を provider で失効する。
 *
 * outbox の lease / retry / hard expiry は DB が正本。アプリは暗号文を claim した時だけ復号し、
 * token、outbox ID、lease ID、provider response をログや例外へ載せない。
 *
 * Provider HTTP 後・finalize 前の process crash で再試行されうるため、Google revoke の
 * 冪等性を前提とする at-least-once dispatch である。
 */

const CLAIM_BATCH_SIZE = 5;
const MAX_CLAIMS_PER_RUN = 20;
const FINALIZE_RETRY_ATTEMPTS = 3;
const DB_RPC_TIMEOUT_MS = 3_000;
const PROVIDER_SETTLEMENT_BUDGET_MS = 19_000;

/**
 * Google revoke の timeout は 15 秒。締切直前に claim して lease だけ残さないため、
 * provider request と finalize RPC の余白を確保できる時だけ次の batch を取る。
 */
const MIN_BATCH_BUDGET_MS = 23_000;

type ClaimedRevoke = {
  outbox_id: string;
  lease_id: string;
  provider: string;
  refresh_token_enc: string;
  expires_at: string;
  lease_expires_at: string;
  attempt_deadline_at: string;
  attempt_count: number;
};

type RevokeAttemptOutcome = 'confirmed' | 'not_started' | 'unconfirmed';
type ItemOutcome = 'revoked' | 'retried' | 'expired' | 'alreadyGone';

type ClaimSettlement = {
  outcome: ItemOutcome;
  deadlineReached: boolean;
};

type ProcessingFailureKind = 'decrypt_failed' | 'provider_failed' | 'unsupported_provider';

type RpcResponse<T> = {
  data: T;
  error: unknown;
};

export type CalendarRevokeOutboxSummary = {
  claimed: number;
  revoked: number;
  retried: number;
  expired: number;
  alreadyGone: number;
  deadlineReached: boolean;
};

class CalendarRevokeOutboxError extends Error {
  readonly code: string;

  constructor(operation: string) {
    super('Calendar revoke outbox processing failed');
    this.name = 'CalendarRevokeOutboxError';
    this.code = `CALENDAR_REVOKE_OUTBOX_${operation.toUpperCase()}_FAILED`;
  }
}

class CalendarRevokeProcessingError extends Error {
  readonly code: string;

  constructor(kind: ProcessingFailureKind) {
    super('Calendar revoke payload processing failed');
    this.name = 'CalendarRevokeProcessingError';
    this.code = `CALENDAR_REVOKE_${kind.toUpperCase()}`;
  }
}

function outboxFailure(operation: string): CalendarRevokeOutboxError {
  return new CalendarRevokeOutboxError(operation);
}

async function callRpc<T>(
  operation: string,
  request: () => PromiseLike<RpcResponse<T>>,
): Promise<T> {
  try {
    const { data, error } = await request();
    if (error) throw outboxFailure(operation);
    return data;
  } catch (error) {
    if (error instanceof CalendarRevokeOutboxError) throw error;
    throw outboxFailure(operation);
  }
}

/**
 * 同じ種類の payload failure は run ごとに1回だけ通知する。
 *
 * raw error を受け取らない形にして、暗号文や token を cause / message 経由で Sentry へ
 * 渡せない境界を作る。
 */
function createProcessingFailureReporter(): (kind: ProcessingFailureKind) => void {
  const reported = new Set<ProcessingFailureKind>();

  return (kind) => {
    if (reported.has(kind)) return;
    reported.add(kind);

    captureUnexpectedError(new CalendarRevokeProcessingError(kind), {
      feature: 'external_calendar',
      operation: 'revoke_outbox_payload',
    });
  };
}

function addOutcome(summary: CalendarRevokeOutboxSummary, outcome: ItemOutcome): void {
  switch (outcome) {
    case 'revoked':
      summary.revoked += 1;
      break;
    case 'retried':
      summary.retried += 1;
      break;
    case 'expired':
      summary.expired += 1;
      break;
    case 'alreadyGone':
      summary.alreadyGone += 1;
      break;
  }
}

function classifyFinalizeResult(result: string, outcome: RevokeAttemptOutcome): ItemOutcome {
  switch (result) {
    case 'revoke_guarded':
    case 'revoked':
      return outcome === 'confirmed' ? 'revoked' : 'alreadyGone';
    case 'retried':
    case 'expiry_guarded':
      return 'retried';
    case 'expired':
      return 'expired';
    case 'missing':
      throw outboxFailure('finalize_missing');
    case 'superseded':
      throw outboxFailure('finalize_superseded');
    default:
      throw outboxFailure('finalize_result');
  }
}

/**
 * Provider call はこの関数の外で最大1回だけ行う。response loss 時は同じ lease / outcome の
 * finalize RPC だけを再送し、provider を再実行しない。
 */
async function finalizeClaim(
  db: SupabaseClient<Database>,
  projectKey: string,
  claim: ClaimedRevoke,
  outcome: RevokeAttemptOutcome,
): Promise<ItemOutcome> {
  const args = {
    p_project_key: projectKey,
    p_outbox_id: claim.outbox_id,
    p_lease_id: claim.lease_id,
    p_outcome: outcome,
  } as const;

  for (let attempt = 1; attempt <= FINALIZE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await callRpc('finalize', () =>
        db
          .rpc('finalize_calendar_revoke_attempt_v2', args)
          .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
      );
      if (typeof result !== 'string') throw outboxFailure('finalize_result');
      return classifyFinalizeResult(result, outcome);
    } catch (error) {
      if (attempt === FINALIZE_RETRY_ATTEMPTS) {
        if (error instanceof CalendarRevokeOutboxError) throw error;
        throw outboxFailure('finalize');
      }
    }
  }

  throw outboxFailure('finalize');
}

function hasProviderSettlementBudget(claim: ClaimedRevoke, deadlineAt: number): boolean {
  const attemptDeadlineAt = Date.parse(claim.attempt_deadline_at);
  if (!Number.isFinite(attemptDeadlineAt)) return false;

  return Math.min(attemptDeadlineAt, deadlineAt) - Date.now() >= PROVIDER_SETTLEMENT_BUDGET_MS;
}

async function processClaim(
  db: SupabaseClient<Database>,
  projectKey: string,
  claim: ClaimedRevoke,
  encryptionKey: string,
  deadlineAt: number,
  reportProcessingFailure: (kind: ProcessingFailureKind) => void,
): Promise<ClaimSettlement> {
  if (!hasProviderSettlementBudget(claim, deadlineAt)) {
    return {
      outcome: await finalizeClaim(db, projectKey, claim, 'not_started'),
      deadlineReached: true,
    };
  }

  if (claim.provider !== 'google') {
    reportProcessingFailure('unsupported_provider');
    return {
      outcome: await finalizeClaim(db, projectKey, claim, 'not_started'),
      deadlineReached: false,
    };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(claim.refresh_token_enc, encryptionKey);
  } catch {
    reportProcessingFailure('decrypt_failed');
    return {
      outcome: await finalizeClaim(db, projectKey, claim, 'not_started'),
      deadlineReached: false,
    };
  }

  let outcome: RevokeAttemptOutcome;
  try {
    outcome = (await googleCalendarAdapter.revoke(refreshToken)) ? 'confirmed' : 'unconfirmed';
  } catch {
    reportProcessingFailure('provider_failed');
    outcome = 'unconfirmed';
  }

  return {
    outcome: await finalizeClaim(db, projectKey, claim, outcome),
    deadlineReached: false,
  };
}

/**
 * hard expiry 成功後に、最大20件の revoke lease を処理する。
 *
 * 1件の finalization failure が同batchの他leaseを中断しないよう、全settlementを待ってから
 * 固定メッセージの error を返す。
 */
export async function processCalendarRevokeOutbox(params: {
  db: SupabaseClient<Database>;
  projectKey: string;
  encryptionKey: string;
  deadlineAt: number;
}): Promise<CalendarRevokeOutboxSummary> {
  const { db, projectKey, encryptionKey, deadlineAt } = params;
  const reportProcessingFailure = createProcessingFailureReporter();
  const summary: CalendarRevokeOutboxSummary = {
    claimed: 0,
    revoked: 0,
    retried: 0,
    expired: 0,
    alreadyGone: 0,
    deadlineReached: false,
  };

  while (summary.claimed < MAX_CLAIMS_PER_RUN) {
    if (deadlineAt - Date.now() < MIN_BATCH_BUDGET_MS) {
      summary.deadlineReached = true;
      break;
    }

    const limit = Math.min(CLAIM_BATCH_SIZE, MAX_CLAIMS_PER_RUN - summary.claimed);
    const claims = await callRpc('claim', () =>
      db
        .rpc('claim_calendar_revoke_outbox_v2', {
          p_project_key: projectKey,
          p_limit: limit,
        })
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS)),
    );
    if (!Array.isArray(claims)) throw outboxFailure('claim_result');
    if (claims.length === 0) break;

    summary.claimed += claims.length;

    const settlements = await Promise.allSettled(
      claims.map(async (claim) => {
        return await processClaim(
          db,
          projectKey,
          claim,
          encryptionKey,
          deadlineAt,
          reportProcessingFailure,
        );
      }),
    );

    let settlementFailed = false;
    for (const settlement of settlements) {
      if (settlement.status === 'fulfilled') {
        addOutcome(summary, settlement.value.outcome);
        summary.deadlineReached ||= settlement.value.deadlineReached;
      } else {
        settlementFailed = true;
      }
    }
    if (settlementFailed) throw outboxFailure('batch_settlement');
    if (summary.deadlineReached || claims.length < limit) break;
  }

  return summary;
}
