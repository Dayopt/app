import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database, Json } from '@/lib/database';
import { captureUnexpectedError } from '@/lib/sentry';

import { resolveGoogleCalendarAuthorityIdentity } from './authority-config';

/**
 * `20260730090017_fenced_calendar_sync_writers.sql` の 5 RPC 群への型付きラッパー（#2050）。
 *
 * retry ループの骨格は `account-deletion.ts` の `callRpc<T>` を、確定失敗コードの分類は
 * `token-rotation.ts` の `DEFINITIVE_ROLLBACK_CODES` パターンを踏襲する
 * （docs/projects/external-calendar-fenced-writer-migration/overview.md §2）。
 *
 * 各 RPC の discriminant（`'started'` / `'superseded'` 等）はそのまま呼び出し側へ返し、
 * 意味付けは `sync-service.ts` / `connection-service.ts` に閉じる。CAS ロジック本体
 * （5 RPC の実装）は凍結資産のため、ここでは一切変更しない。
 */

const RPC_TIMEOUT_MS = 8_000;
const RPC_ATTEMPTS = 3;
/** service_role client の floor timeout。個別 query の abortSignal より長くてよい。 */
const CLIENT_FLOOR_TIMEOUT_MS = 15_000;

/**
 * definitive = 即終了・retry しない。retryable = 応答喪失と同じ扱いで同一引数 retry する
 * （overview.md §2 のエラーコード分類表）。
 *
 * - `22023`（invalid input）: 呼び出し側のバグでしか到達しない値域。Sentry capture する
 * - `54000`（sequence exhausted）: 理論上 到達しない値域。Sentry capture する
 * - `CA019`（account deletion in progress、`assert_calendar_account_not_deleting_v1` 由来）:
 *   想定内。Sentry capture しない
 */
const DEFINITIVE_CODES_WITH_ALERT = new Set(['22023', '54000']);
const DEFINITIVE_CODE_ACCOUNT_DELETING = 'CA019';

/**
 * `'unresolved'`: retry を使い切っても確定しなかった（Sentry 済み）。
 * `'rejected_input'`: 呼び出し側のバグ相当の入力拒否（Sentry 済み）。
 * `'account_deleting'`: account deletion 進行中（想定内、Sentry なし）。
 * `'deadline_exceeded'`: 呼び出し側の残予算が尽きたため試行しなかった（想定内、Sentry なし）。
 */
type FencedWriterFailure =
  'unresolved' | 'rejected_input' | 'account_deleting' | 'deadline_exceeded';

/**
 * 次の 1 試行を始める残予算があるか（pr-cross-review P2 指摘、PR #2276）。
 *
 * `deadlineAt` 未指定（呼び出し側が締切を持たない）なら常に true。DB 劣化時に
 * `RPC_TIMEOUT_MS × RPC_ATTEMPTS` を残予算に関係なく毎回消費すると、1 接続が
 * cron の maxDuration を食い潰し、同一 run 内の後続接続を starve させる
 * （adapter 側の `adapterDeadlineAt` と同じ理由でのガード）。
 */
function hasBudgetForAttempt(deadlineAt: number | undefined): boolean {
  if (deadlineAt === undefined) return true;
  return deadlineAt - Date.now() >= RPC_TIMEOUT_MS;
}

function isDefinitiveFailure(
  code: string | undefined,
  operation: string,
): FencedWriterFailure | null {
  if (code === DEFINITIVE_CODE_ACCOUNT_DELETING) return 'account_deleting';
  if (code && DEFINITIVE_CODES_WITH_ALERT.has(code)) {
    captureUnexpectedError(new Error(`fenced calendar writer rejected input: ${operation}`), {
      feature: 'external_calendar',
      operation,
      source: 'supabase_rpc',
      errorCode: code,
    });
    return 'rejected_input';
  }
  return null;
}

function reportUnresolved(operation: string): 'unresolved' {
  captureUnexpectedError(new Error(`fenced calendar writer outcome is unresolved: ${operation}`), {
    feature: 'external_calendar',
    operation,
    source: 'supabase_rpc',
  });
  return 'unresolved';
}

type FencedSyncWriterDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Pick<
      Database['public']['Functions'],
      | 'begin_calendar_sync_run_v1'
      | 'clear_calendar_sync_cursor_command_v1'
      | 'finish_calendar_sync_run_v1'
      | 'persist_calendar_sync_result_command_v1'
      | 'replace_selected_calendars_command_v1'
    >;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type FencedSyncWriterClient = SupabaseClient<FencedSyncWriterDatabase>;

function createFencedSyncWriterClient(): FencedSyncWriterClient {
  return createClient<FencedSyncWriterDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            signal: options?.signal ?? AbortSignal.timeout(CLIENT_FLOOR_TIMEOUT_MS),
          }),
      },
    },
  );
}

/** `p_project_key` を解決する。authority config 未解決なら null（呼び出し側で `not_configured` 等に畳む）。 */
export function resolveProjectKey(): string | null {
  return resolveGoogleCalendarAuthorityIdentity()?.projectKey ?? null;
}

/** 4 RPC（`begin` 以外）に共通する CAS 入力。 */
export type CasContext = {
  connectionId: string;
  userId: string;
  projectKey: string;
  expectedGeneration: number;
  expectedAuthorityFenceId: string;
  expectedAuthorityEpoch: number;
};

/** `TEXT` を1つ返す RPC 用の共通 retry ループ。応答喪失と rollback を区別せず同一引数で retry する。 */
async function callTextRpc(
  operation: string,
  deadlineAt: number | undefined,
  request: () => PromiseLike<{ data: string | null; error: { code?: string } | null }>,
): Promise<string | FencedWriterFailure> {
  for (let attempt = 0; attempt < RPC_ATTEMPTS; attempt += 1) {
    if (!hasBudgetForAttempt(deadlineAt)) return 'deadline_exceeded';
    try {
      const { data, error } = await request();
      if (!error && data !== null) return data;

      const definitive = isDefinitiveFailure(error?.code, operation);
      if (definitive !== null) return definitive;
      // それ以外（network 例外、40P01 デッドロック、55P03 lock not available 含む）は retry。
    } catch {
      // 同上。
    }
  }
  return reportUnresolved(operation);
}

// =============================================================================
// begin_calendar_sync_run_v1（RETURNS TABLE、他 4 つと shape が異なる）
// =============================================================================

type BeginSyncRunOutcome =
  | FencedWriterFailure
  | { result: 'missing' }
  | { result: 'reauth_required' }
  | { result: 'superseded' }
  | {
      result: 'started';
      dataGeneration: number;
      authorityFenceId: string;
      authorityEpoch: number;
      syncSequence: number;
      runStartedAt: string;
      refreshTokenEnc: string;
    };

export async function beginCalendarSyncRun(params: {
  connectionId: string;
  userId: string;
  projectKey: string;
  deadlineAt?: number | undefined;
}): Promise<BeginSyncRunOutcome> {
  const operation = 'begin_calendar_sync_run';

  for (let attempt = 0; attempt < RPC_ATTEMPTS; attempt += 1) {
    if (!hasBudgetForAttempt(params.deadlineAt)) return 'deadline_exceeded';
    try {
      const db = createFencedSyncWriterClient();
      const { data, error } = await db
        .rpc('begin_calendar_sync_run_v1', {
          p_project_key: params.projectKey,
          p_user_id: params.userId,
          p_connection_id: params.connectionId,
        })
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));

      if (!error && data !== null) {
        const row = data[0];
        if (row === undefined) {
          // RETURNS TABLE が空集合を返すのは実装上ありえないが、fail closed で扱う。
          return reportUnresolved(operation);
        }
        if (row.result === 'started') {
          return {
            result: 'started',
            dataGeneration: row.data_generation,
            authorityFenceId: row.authority_fence_id,
            authorityEpoch: row.authority_epoch,
            syncSequence: row.sync_sequence,
            runStartedAt: row.run_started_at,
            refreshTokenEnc: row.refresh_token_enc,
          };
        }
        if (
          row.result === 'missing' ||
          row.result === 'reauth_required' ||
          row.result === 'superseded'
        ) {
          return { result: row.result };
        }
        return reportUnresolved(operation);
      }

      const definitive = isDefinitiveFailure(error?.code, operation);
      if (definitive !== null) return definitive;
    } catch {
      // response 欠落と rollback を区別できないため同一引数で retry する。
    }
  }

  return reportUnresolved(operation);
}

// =============================================================================
// clear_calendar_sync_cursor_command_v1
// =============================================================================

type ClearSyncCursorResult = 'cleared' | 'missing' | 'missing_selection' | 'superseded';

export async function clearCalendarSyncCursor(
  cas: CasContext & {
    expectedSyncSequence: number;
    calendarSelectionId: string;
    providerCalendarId: string;
    expectedSyncToken: string | null;
    deadlineAt?: number | undefined;
  },
): Promise<ClearSyncCursorResult | FencedWriterFailure> {
  const outcome = await callTextRpc('clear_calendar_sync_cursor', cas.deadlineAt, async () => {
    const db = createFencedSyncWriterClient();
    return db
      .rpc('clear_calendar_sync_cursor_command_v1', {
        p_project_key: cas.projectKey,
        p_user_id: cas.userId,
        p_connection_id: cas.connectionId,
        p_expected_generation: cas.expectedGeneration,
        p_expected_authority_fence_id: cas.expectedAuthorityFenceId,
        p_expected_authority_epoch: cas.expectedAuthorityEpoch,
        p_expected_sync_sequence: cas.expectedSyncSequence,
        p_calendar_selection_id: cas.calendarSelectionId,
        p_provider_calendar_id: cas.providerCalendarId,
        p_expected_sync_token: cas.expectedSyncToken as never,
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  });
  return outcome as ClearSyncCursorResult | FencedWriterFailure;
}

// =============================================================================
// persist_calendar_sync_result_command_v1
// =============================================================================

type PersistSyncResultResult = 'persisted' | 'missing' | 'missing_selection' | 'superseded';

export async function persistCalendarSyncResult(
  cas: CasContext & {
    expectedSyncSequence: number;
    calendarSelectionId: string;
    providerCalendarId: string;
    runStartedAt: string;
    events: Json;
    tombstoneEventIds: string[];
    usedFullSync: boolean;
    nextCursor: string | null;
    deadlineAt?: number | undefined;
  },
): Promise<PersistSyncResultResult | FencedWriterFailure> {
  const outcome = await callTextRpc('persist_calendar_sync_result', cas.deadlineAt, async () => {
    const db = createFencedSyncWriterClient();
    return db
      .rpc('persist_calendar_sync_result_command_v1', {
        p_project_key: cas.projectKey,
        p_user_id: cas.userId,
        p_connection_id: cas.connectionId,
        p_expected_generation: cas.expectedGeneration,
        p_expected_authority_fence_id: cas.expectedAuthorityFenceId,
        p_expected_authority_epoch: cas.expectedAuthorityEpoch,
        p_expected_sync_sequence: cas.expectedSyncSequence,
        p_calendar_selection_id: cas.calendarSelectionId,
        p_provider_calendar_id: cas.providerCalendarId,
        p_run_started_at: cas.runStartedAt,
        p_events: cas.events,
        p_tombstone_event_ids: cas.tombstoneEventIds,
        p_used_full_sync: cas.usedFullSync,
        p_next_cursor: cas.nextCursor as never,
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  });
  return outcome as PersistSyncResultResult | FencedWriterFailure;
}

// =============================================================================
// finish_calendar_sync_run_v1
// =============================================================================

type FinishSyncRunResult = 'finished' | 'missing' | 'superseded';

export async function finishCalendarSyncRun(
  cas: CasContext & {
    expectedSyncSequence: number;
    runStartedAt: string;
    lastSyncError: string | null;
    deadlineAt?: number | undefined;
  },
): Promise<FinishSyncRunResult | FencedWriterFailure> {
  const outcome = await callTextRpc('finish_calendar_sync_run', cas.deadlineAt, async () => {
    const db = createFencedSyncWriterClient();
    return db
      .rpc('finish_calendar_sync_run_v1', {
        p_project_key: cas.projectKey,
        p_user_id: cas.userId,
        p_connection_id: cas.connectionId,
        p_expected_generation: cas.expectedGeneration,
        p_expected_authority_fence_id: cas.expectedAuthorityFenceId,
        p_expected_authority_epoch: cas.expectedAuthorityEpoch,
        p_expected_sync_sequence: cas.expectedSyncSequence,
        p_run_started_at: cas.runStartedAt,
        p_last_sync_error: cas.lastSyncError as never,
        p_prune_window: false,
        p_not_before: null as never,
        p_not_after: null as never,
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  });
  return outcome as FinishSyncRunResult | FencedWriterFailure;
}

// =============================================================================
// replace_selected_calendars_command_v1
// =============================================================================

type ReplaceSelectedCalendarsResult = 'updated' | 'missing' | 'superseded';

export async function replaceSelectedCalendars(
  cas: Omit<CasContext, 'expectedGeneration'> & {
    expectedGeneration: number;
    selectedCalendars: Json;
  },
): Promise<ReplaceSelectedCalendarsResult | FencedWriterFailure> {
  // ユーザー起点の一回操作（connection-service.ts の updateSelectedCalendars）で、
  // cron の共有予算を持たないため deadline は対象外（pr-cross-review 指摘の対象は
  // sync 経路の 4 関数のみ、overview.md 対象外）。
  const outcome = await callTextRpc('replace_selected_calendars', undefined, async () => {
    const db = createFencedSyncWriterClient();
    return db
      .rpc('replace_selected_calendars_command_v1', {
        p_project_key: cas.projectKey,
        p_user_id: cas.userId,
        p_connection_id: cas.connectionId,
        p_expected_generation: cas.expectedGeneration,
        p_expected_authority_fence_id: cas.expectedAuthorityFenceId,
        p_expected_authority_epoch: cas.expectedAuthorityEpoch,
        p_selected_calendars: cas.selectedCalendars,
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  });
  return outcome as ReplaceSelectedCalendarsResult | FencedWriterFailure;
}
