import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database/generated/database.types';
import { captureUnexpectedError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

import { googleCalendarAdapter } from './providers/google';
import { decryptToken, isValidEncryptionKey } from './token-crypto';

/**
 * purge 後に残した revoke-only refresh token を provider で失効する worker。
 *
 * outbox の lease / retry / hard expiry は DB が正本。アプリは暗号文を claim した時だけ復号し、
 * token、outbox ID、lease ID、provider response をログや例外へ載せない。
 */

const CLAIM_BATCH_SIZE = 5;
const MAX_CLAIMS_PER_RUN = 20;
const EXPIRY_BATCH_SIZE = 250;
const DB_RPC_TIMEOUT_MS = 3_000;
const PROVIDER_SETTLEMENT_BUDGET_MS = 19_000;

/**
 * Google revoke の timeout は 15 秒。締切直前に claim して lease だけ残さないため、
 * provider request と completion RPC の余白を確保できる時だけ次の batch を取る。
 */
/**
 * 1 batch を安全に回すのに必要な残り時間。`deadlineAt` までがこれを割ると 1 件も claim
 * せずに終わるため、呼び出し側（cron の Composition Layer）は**これを下回る deadline を
 * 渡してはいけない**。渡すと revoke request が provider へ永久に送られない。
 */
export const MIN_BATCH_BUDGET_MS = 23_000;

/**
 * `processCalendarRevokeOutbox` が 1 batch でも claim できる最小の deadline 窓。
 *
 * claim ループへ入る前に ciphertext 24h 上限の expire RPC を 1 本必ず実行するため、
 * 呼び出し側が `MIN_BATCH_BUDGET_MS` ちょうどしか渡さないと、その RPC が遅れた分だけ
 * 最初の claim 判定時に残りが下限を割り、毎回 0 件で終わる。呼び出し側はこの値を
 * 下限として使う。
 */
export const MIN_RUN_BUDGET_MS = MIN_BATCH_BUDGET_MS + DB_RPC_TIMEOUT_MS;

type ClaimedRevoke = {
  outbox_id: string;
  lease_id: string;
  provider: string;
  refresh_token_enc: string;
};

type ItemOutcome = 'revoked' | 'retried' | 'expired' | 'alreadyGone';

type ProcessingFailureKind = 'decrypt_failed' | 'provider_failed' | 'unsupported_provider';

export type CalendarRevokeOutboxSummary = {
  claimed: number;
  revoked: number;
  retried: number;
  expired: number;
  alreadyGone: number;
  deadlineReached: boolean;
  encryptionAvailable: boolean;
};

class CalendarRevokeMaintenanceError extends Error {
  readonly code: string;

  constructor(operation: string) {
    super('Calendar revoke maintenance failed');
    this.name = 'CalendarRevokeMaintenanceError';
    this.code = `CALENDAR_REVOKE_${operation.toUpperCase()}_FAILED`;
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

function maintenanceFailure(operation: string): CalendarRevokeMaintenanceError {
  return new CalendarRevokeMaintenanceError(operation);
}

/**
 * 同じ種類の payload failure は run ごとに 1 回だけ通知する。
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

async function retryClaim(
  db: SupabaseClient<Database>,
  claim: ClaimedRevoke,
): Promise<Exclude<ItemOutcome, 'revoked'>> {
  let retryResult: string;
  try {
    const { data, error } = await db
      .rpc('retry_calendar_revoke_outbox_v1', {
        p_outbox_id: claim.outbox_id,
        p_lease_id: claim.lease_id,
      })
      .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
    if (error) throw maintenanceFailure('retry');
    retryResult = data;
  } catch (error) {
    if (error instanceof CalendarRevokeMaintenanceError) throw error;
    throw maintenanceFailure('retry');
  }

  switch (retryResult) {
    case 'retried':
      return 'retried';
    case 'expired':
      return 'expired';
    case 'missing':
      // provider revoke 未確認のまま hard-expiry cron が暗号文を消した可能性がある。
      // 再投入はできないため expired として監査・monitoring 側へ残す。
      return 'expired';
    default:
      throw maintenanceFailure('retry_result');
  }
}

async function processClaim(
  db: SupabaseClient<Database>,
  claim: ClaimedRevoke,
  encryptionKey: string,
  reportProcessingFailure: (kind: ProcessingFailureKind) => void,
): Promise<ItemOutcome> {
  if (claim.provider !== 'google') {
    reportProcessingFailure('unsupported_provider');
    return await retryClaim(db, claim);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(claim.refresh_token_enc, encryptionKey);
  } catch {
    reportProcessingFailure('decrypt_failed');
    return await retryClaim(db, claim);
  }

  let revoked: boolean;
  try {
    revoked = await googleCalendarAdapter.revoke(refreshToken);
  } catch {
    // adapter の既知の network / provider failure は false。throw は実装上の想定外だけを通知する。
    reportProcessingFailure('provider_failed');
    return await retryClaim(db, claim);
  }

  if (!revoked) return await retryClaim(db, claim);

  let completed: boolean;
  try {
    const { data, error } = await db
      .rpc('complete_calendar_revoke_outbox_v1', {
        p_outbox_id: claim.outbox_id,
        p_lease_id: claim.lease_id,
      })
      .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
    if (error) throw maintenanceFailure('complete');
    completed = data;
  } catch (error) {
    if (error instanceof CalendarRevokeMaintenanceError) throw error;
    throw maintenanceFailure('complete');
  }

  // provider revoke 後に hard expiry / lease takeover が済んでいても安全な既処理として扱う。
  return completed ? 'revoked' : 'alreadyGone';
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

export async function processCalendarRevokeOutbox(params: {
  encryptionKey: string | undefined;
  deadlineAt: number;
}): Promise<CalendarRevokeOutboxSummary> {
  const { encryptionKey, deadlineAt } = params;
  let db: SupabaseClient<Database>;
  try {
    db = createServiceRoleClient();
  } catch {
    throw maintenanceFailure('client');
  }
  const summary: CalendarRevokeOutboxSummary = {
    claimed: 0,
    revoked: 0,
    retried: 0,
    expired: 0,
    alreadyGone: 0,
    deadlineReached: false,
    encryptionAvailable: isValidEncryptionKey(encryptionKey),
  };

  // key が壊れていても ciphertext の 24h 上限だけは必ず守る。
  try {
    const { data, error } = await db
      .rpc('expire_calendar_revoke_outbox_v1', { p_limit: EXPIRY_BATCH_SIZE })
      .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
    if (error || typeof data !== 'number') throw maintenanceFailure('expire');
    summary.expired = data;
  } catch (error) {
    if (error instanceof CalendarRevokeMaintenanceError) throw error;
    throw maintenanceFailure('expire');
  }

  if (!summary.encryptionAvailable || encryptionKey === undefined) return summary;

  const reportProcessingFailure = createProcessingFailureReporter();

  while (summary.claimed < MAX_CLAIMS_PER_RUN) {
    if (deadlineAt - Date.now() < MIN_BATCH_BUDGET_MS) {
      summary.deadlineReached = true;
      break;
    }

    const limit = Math.min(CLAIM_BATCH_SIZE, MAX_CLAIMS_PER_RUN - summary.claimed);
    let claims: ClaimedRevoke[];
    try {
      const { data, error } = await db
        .rpc('claim_calendar_revoke_outbox_v1', { p_limit: limit })
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));
      if (error) throw maintenanceFailure('claim');
      claims = data ?? [];
    } catch (error) {
      if (error instanceof CalendarRevokeMaintenanceError) throw error;
      throw maintenanceFailure('claim');
    }
    if (claims.length === 0) break;

    summary.claimed += claims.length;

    // claim 中の遅延で provider + settlement の余白を失った場合、provider を始めず全 lease を
    // retry へ戻す。次回 cron が安全に再取得できる状態まで待ってから終了する。
    if (deadlineAt - Date.now() < PROVIDER_SETTLEMENT_BUDGET_MS) {
      summary.deadlineReached = true;
      const releases = await Promise.allSettled(
        claims.map(async (claim) => {
          return await retryClaim(db, claim);
        }),
      );
      let releaseFailed = false;
      for (const release of releases) {
        if (release.status === 'fulfilled') addOutcome(summary, release.value);
        else releaseFailed = true;
      }
      if (releaseFailed) throw maintenanceFailure('deadline_release');
      break;
    }

    // 1 件の settlement failure で Promise.all が早期 reject すると、同 batch の残りが
    // serverless teardown で中断されうる。全 lease の complete/retry が終わるまで必ず待つ。
    const settlements = await Promise.allSettled(
      claims.map(async (claim) => {
        return await processClaim(db, claim, encryptionKey, reportProcessingFailure);
      }),
    );
    let settlementFailed = false;
    for (const settlement of settlements) {
      if (settlement.status === 'fulfilled') addOutcome(summary, settlement.value);
      else settlementFailed = true;
    }
    if (settlementFailed) throw maintenanceFailure('batch_settlement');

    if (claims.length < limit) break;
  }

  return summary;
}
