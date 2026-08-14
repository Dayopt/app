import 'server-only';

import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import { databaseTables, type Database } from '@/lib/database';
import { getConfiguredExternalLifecycleAppVersion } from '@/lib/database/external-lifecycle-version';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError, captureUnexpectedError } from '@/lib/sentry';

import { deleteUnreferencedEvents } from './event-pruning';
import { ExternalCalendarServiceError } from './external-calendar-service-error';
import { googleCalendarAdapter } from './providers/google';
import {
  CalendarProviderError,
  type CalendarProviderAdapter,
  type NormalizedExternalEvent,
  type ProviderSession,
  type SyncWindow,
} from './providers/types';
import { decryptToken } from './token-crypto';
import { markCalendarConnectionReauth, persistCalendarTokenRotation } from './token-rotation';

/**
 * 外部カレンダー同期エンジン（overview.md §6-2）。
 *
 * cron route（Step 5）と tRPC `syncNow`（Step 4）が同じ `syncConnection` を呼ぶ。書き込みは
 * すべて service_role で行い、全クエリに `user_id` を明示する（ミラーは authenticated から
 * INSERT/DELETE できない）。
 */

/** iCal feed route / token endpoint と同じ外部呼び出しタイムアウト（`lib/supabase/oauth.ts`）。 */
const DB_REQUEST_TIMEOUT_MS = 15_000;

/** 取り込み window の半径。iCal export と同じ ±90 日（overview.md §1）。 */
const WINDOW_RADIUS_MS = 90 * 24 * 60 * 60 * 1000;

/** tombstone UPDATE の 1 バッチあたり件数。URL 長を意識した値。 */
const TOMBSTONE_BATCH_SIZE = 150;

const PROVIDER = 'google';

/**
 * `last_sync_error` に入れる安定コード。
 *
 * この列は authenticated に SELECT が GRANT されているので、provider の生メッセージや URL を
 * 入れてはいけない（PII / 内部情報の露出）。値域を閉じておき、UI（Step 6）が i18n する。
 */
type SyncErrorCode =
  | 'reauth_required'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'encryption_key_invalid'
  | 'partial_failure'
  /** wall-clock 予算切れで一部カレンダーへ着手できなかった（#1965）。`partial_failure`
   * （provider / DB が実際に失敗した）とは区別する — こちらは次回 sync で前進する見込みがある。 */
  | 'partial_timeout';

// Step 4（tRPC）/ Step 5（cron）が消費者になるまで export しない。呼び出し側は
// Awaited<ReturnType<typeof syncConnection>> で受け、必要になった時点で export する。
type SyncOutcome =
  | 'synced'
  | 'skipped_reauth_required'
  | 'reauth_required'
  | 'encryption_key_invalid'
  | 'partial_failure'
  | 'partial_timeout'
  | 'not_configured';

type SyncConnectionResult = {
  outcome: SyncOutcome;
  calendarsSynced: number;
  calendarsFailed: number;
};

/**
 * service_role client が触れる surface を同期に必要な 3 テーブルへ narrow する。
 * `connection-service.ts` と同じ理由 — RLS を bypass する client が他テーブルへ到達できると
 * cross-tenant leak になるので compile error で止める。plans / records の anti-join は
 * `event-pruning.ts` が別 client で担うので、ここには含めない。
 */
type SyncDatabase = {
  public: {
    Tables: Pick<
      Database['public']['Tables'],
      'external_calendar_events' | 'calendar_connections' | 'calendar_connection_calendars'
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type SyncClient = SupabaseClient<SyncDatabase>;

function createSyncDbClient(): SyncClient {
  return createClient<SyncDatabase>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    // narrow 版には `createServiceRoleClient` の timeout 注入が無いので、ここで足す。
    global: {
      fetch: (url, options) =>
        fetch(url, {
          ...options,
          signal: options?.signal ?? AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS),
        }),
    },
  });
}

/** `refresh_token_enc` は column-scoped grant 外だが service_role なので読める。列は明示列挙する。 */
type ConnectionRow = {
  data_generation: number;
  id: string;
  user_id: string;
  status: string;
  refresh_token_enc: string;
};

type CalendarRow = {
  provider_calendar_id: string;
  calendar_name: string | null;
  sync_token: string | null;
};

/**
 * 1 接続を同期する。
 *
 * provider / 個別カレンダーの失敗ではここで throw しない（既に `last_sync_error` と Sentry に
 * 記録済み）。cron が 1 接続の失敗で全体を止めないための設計。ただし connection 行すら読めない
 * DB 障害だけは、状態を記録する術も無い真の異常なので `ExternalCalendarServiceError` を投げて
 * 呼び出し側（cron dispatcher / tRPC）に委ねる。connection が単に存在しない場合は
 * `outcome: 'not_configured'` を返す。
 */
export async function syncConnection(params: {
  connectionId: string;
  userId: string;
  /** true なら全カレンダーの sync_token を無視して full sync する（overview.md §6-2 の定期 full resync 機構）。 */
  forceFullSync?: boolean;
  /**
   * `Date.now()` 換算の締切（ms）（#1965）。省略時は無制限（既存呼び出し互換）。
   * カレンダー単位・ページ単位の両方のループで尊重される — 呼び出し側は自分の
   * maxDuration に対する安全マージンを引いた値を渡す（cron の `TIME_BUDGET_MS` と同じ形）。
   */
  deadlineAt?: number | undefined;
}): Promise<SyncConnectionResult> {
  const { connectionId, userId, forceFullSync = false, deadlineAt } = params;
  const adapter: CalendarProviderAdapter = googleCalendarAdapter;
  const db = createSyncDbClient();
  const lifecycleVersion = await getConfiguredExternalLifecycleAppVersion();

  // run の生成時刻。全 upsert 行と sweep 条件の両方でこの単一値を使う。行ごとに now() を
  // 使うと sweep の境界がぶれて正しい行を消す。
  const runStartedAt = new Date();
  const runStartedAtIso = runStartedAt.toISOString();

  const connection = await loadConnection(db, connectionId, userId, lifecycleVersion);
  if (connection === null) {
    return { outcome: 'not_configured', calendarsSynced: 0, calendarsFailed: 0 };
  }

  if (connection.status === 'reauth_required') {
    return { outcome: 'skipped_reauth_required', calendarsSynced: 0, calendarsFailed: 0 };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(
      connection.refresh_token_enc,
      env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
    );
  } catch (error) {
    // 鍵の設定ミスは運用側のバグ。全ユーザーを再同意に追い込まないよう status は変えない。
    captureUnexpectedError(error instanceof Error ? error : new Error('token decrypt failed'), {
      feature: 'external_calendar',
      operation: 'decrypt_refresh_token',
    });
    await writeConnectionError(db, connectionId, userId, 'encryption_key_invalid', runStartedAtIso);
    return { outcome: 'encryption_key_invalid', calendarsSynced: 0, calendarsFailed: 0 };
  }

  // provider callの応答が失われても同じtoken acquisitionをDB側で同定できるよう、
  // operation IDはrefresh開始前に一度だけ生成する。
  const rotationOperationId = randomUUID();
  let session: ProviderSession;
  try {
    session = await adapter.startSession(refreshToken);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      const reauthOutcome = await markCalendarConnectionReauth({
        userId,
        connectionId,
        expectedGeneration: connection.data_generation,
        expectedRefreshTokenEnc: connection.refresh_token_enc,
        lastSyncedAt: runStartedAtIso,
      });
      return reauthResult(reauthOutcome, 0, 0);
    }
    captureProviderError(error, 'start_session');
    await writeConnectionError(db, connectionId, userId, providerErrorCode(error), runStartedAtIso);
    return { outcome: 'partial_failure', calendarsSynced: 0, calendarsFailed: 0 };
  }

  // Google が rotation した場合だけ保存し直す。黙って捨てると次回から死ぬ。
  let markReauthAfterRotation: Awaited<
    ReturnType<typeof persistCalendarTokenRotation>
  >['markReauthIfCurrent'] = null;
  if (session.rotatedRefreshToken !== null) {
    const rotationResult = await persistCalendarTokenRotation({
      operationId: rotationOperationId,
      userId,
      connectionId,
      expectedGeneration: connection.data_generation,
      expectedRefreshTokenEnc: connection.refresh_token_enc,
      rotatedRefreshToken: session.rotatedRefreshToken,
      encryptionKey: env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
      provider: adapter,
      lastSyncedAt: runStartedAtIso,
    });
    const { outcome: rotationOutcome } = rotationResult;
    markReauthAfterRotation = rotationResult.markReauthIfCurrent;

    if (rotationOutcome === 'enqueued' || rotationOutcome === 'missing') {
      return { outcome: 'not_configured', calendarsSynced: 0, calendarsFailed: 0 };
    }

    if (rotationOutcome === 'reauth_required') {
      return { outcome: 'reauth_required', calendarsSynced: 0, calendarsFailed: 0 };
    }
    if (rotationOutcome === 'superseded') {
      return { outcome: 'partial_failure', calendarsSynced: 0, calendarsFailed: 0 };
    }
    if (rotationOutcome === 'unresolved') {
      throw new ExternalCalendarServiceError(
        'SYNC_FAILED',
        'calendar token rotation is unresolved',
      );
    }
  }

  const calendars = await loadSelectedCalendars(db, connectionId, userId);
  if (calendars === null) {
    // Sentry には既に出ている。ここでは「成功として last_synced_at を進めない」ことと、
    // ユーザーに見える形でエラーを残すことが要る。
    await writeConnectionError(db, connectionId, userId, 'partial_failure', runStartedAtIso);
    return { outcome: 'partial_failure', calendarsSynced: 0, calendarsFailed: 0 };
  }

  const window: SyncWindow = {
    timeMin: new Date(runStartedAt.getTime() - WINDOW_RADIUS_MS).toISOString(),
    timeMax: new Date(runStartedAt.getTime() + WINDOW_RADIUS_MS).toISOString(),
  };

  let calendarsSynced = 0;
  let calendarsFailed = 0;
  // 予算切れで着手できなかった／完走できなかったカレンダー数。calendarsFailed とは区別する
  // （こちらは provider / DB が実際に失敗したわけではなく、次回 sync で前進する見込みがある）。
  let calendarsIncomplete = 0;
  let reauthRequired = false;

  for (const calendar of calendars) {
    const outcome = await syncOneCalendar({
      db,
      adapter,
      session,
      connection,
      calendar,
      window,
      runStartedAtIso,
      forceFullSync,
      deadlineAt,
    });

    if (outcome === 'synced') calendarsSynced += 1;
    else if (outcome === 'reauth_required') reauthRequired = true;
    else if (outcome === 'deadline_exceeded') calendarsIncomplete += 1;
    else calendarsFailed += 1;
  }

  if (reauthRequired) {
    // rotation済みなら同じrunが保存した新ciphertextをclosure内のCAS証明でmarkする。
    // 旧ciphertextで判定すると、正しい新authorityをsupersededと誤認する。
    const reauthOutcome =
      markReauthAfterRotation === null
        ? await markCalendarConnectionReauth({
            userId,
            connectionId,
            expectedGeneration: connection.data_generation,
            expectedRefreshTokenEnc: connection.refresh_token_enc,
            lastSyncedAt: runStartedAtIso,
          })
        : await markReauthAfterRotation();
    return reauthResult(reauthOutcome, calendarsSynced, calendarsFailed);
  }

  // 参照されていない window 外行を掃除する。connection 単位で 1 回だけ（calendar ごとに
  // 回すと他カレンダーの行も対象になり、無駄に N 回走る）。window 境界は provider へ渡したのと
  // 同じ値を使う。anti-join の本体は event-pruning.ts に集約している。
  // best-effort — 失敗しても sync 自体は成功として扱う（fail-closed にすると cleanup 失敗が
  // 同期結果全体を巻き込む）。拾いきれなかった行は次回の sync か disconnect の prune が回収する。
  try {
    await deleteUnreferencedEvents({
      userId,
      connectionId,
      scope: { kind: 'window', notBefore: window.timeMin, notAfter: window.timeMax },
    });
  } catch (error) {
    logger.warn('[calendar-sync] failed to prune out-of-window events');
    captureUnexpectedError(error instanceof Error ? error : new Error('calendar prune failed'), {
      feature: 'external_calendar',
      operation: 'sync_window_prune',
    });
  }

  if (calendarsIncomplete > 0) {
    // 予算切れで一部カレンダーへ着手できなかった／完走できなかった。完走した分の進捗
    // （calendarsSynced、sync_token）は既に保存済みなので、次回 sync はこのカレンダーから
    // 再開する。calendarsFailed（実際の失敗）も同時に起きうるが、リトライ導線は共通なので
    // ここでは区別しない — 予算内で再試行すれば実際の失敗だけが残る形で次回報告される。
    await writeConnectionError(db, connectionId, userId, 'partial_timeout', runStartedAtIso);
    return { outcome: 'partial_timeout', calendarsSynced, calendarsFailed };
  }

  if (calendarsFailed > 0) {
    await writeConnectionError(db, connectionId, userId, 'partial_failure', runStartedAtIso);
    return { outcome: 'partial_failure', calendarsSynced, calendarsFailed };
  }

  await writeConnectionSuccess(db, connectionId, userId, runStartedAtIso);
  return { outcome: 'synced', calendarsSynced, calendarsFailed };
}

type CalendarSyncOutcome = 'synced' | 'reauth_required' | 'deadline_exceeded' | 'failed';

async function syncOneCalendar(args: {
  db: SyncClient;
  adapter: CalendarProviderAdapter;
  session: ProviderSession;
  connection: ConnectionRow;
  calendar: CalendarRow;
  window: SyncWindow;
  runStartedAtIso: string;
  forceFullSync: boolean;
  deadlineAt?: number | undefined;
}): Promise<CalendarSyncOutcome> {
  const {
    db,
    adapter,
    session,
    connection,
    calendar,
    window,
    runStartedAtIso,
    forceFullSync,
    deadlineAt,
  } = args;

  const cursor = forceFullSync ? null : calendar.sync_token;

  let result: Awaited<ReturnType<CalendarProviderAdapter['syncCalendar']>>;
  try {
    result = await adapter.syncCalendar(session, {
      calendarId: calendar.provider_calendar_id,
      cursor,
      window,
      deadlineAt,
    });

    if (result.cursorInvalid) {
      // 410。cursor を捨てて同じ run 内で 1 回だけ full sync をやり直す。
      await clearSyncToken(db, connection, calendar);
      result = await adapter.syncCalendar(session, {
        calendarId: calendar.provider_calendar_id,
        cursor: null,
        window,
        deadlineAt,
      });
    }
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      return 'reauth_required';
    }
    captureProviderError(error, 'sync_calendar');
    return 'failed';
  }

  try {
    if (result.events.length > 0) {
      await upsertActiveEvents(db, connection, calendar, result.events, runStartedAtIso);
    }

    const tombstoneIds = [...result.cancelledEventIds, ...result.skippedEventIds];
    if (tombstoneIds.length > 0) {
      await tombstoneEvents(db, connection, calendar, tombstoneIds, runStartedAtIso);
    }

    // full sync は cancelled を返さない（showDeleted 既定 false）ので、provider 側で消えた
    // 行が active のまま残る。全ページ完走した full sync のときだけ mark-and-sweep で掃除する。
    // ページ途中で落ちた（nextCursor === null かつ events 未完）run では走らせない。
    if (result.usedFullSync && result.nextCursor !== null) {
      await sweepStaleEvents(db, connection, calendar, runStartedAtIso);
    }

    // 全ページ走破に成功したときだけ cursor を確定する。途中で落ちたら保存せず、次回また
    // 先頭からやり直す（upsert は冪等）。
    if (result.nextCursor !== null) {
      await saveSyncToken(db, connection, calendar, result.nextCursor, runStartedAtIso);
    }

    // 予算切れで打ち切られた（events/tombstone は取得できた分だけ保存済み）。'synced' に
    // 含めると、次回 sync が要ることが呼び出し側から見えなくなる。
    if (result.deadlineExceeded) return 'deadline_exceeded';

    return 'synced';
  } catch (error) {
    captureDatabaseError(error, 'persist_calendar_events');
    return 'failed';
  }
}

// =============================================================================
// DB 操作
// =============================================================================

async function loadConnection(
  db: SyncClient,
  connectionId: string,
  userId: string,
  lifecycleVersion: 0 | 1,
): Promise<ConnectionRow | null> {
  if (lifecycleVersion === 0) {
    const { data, error } = await db
      .from(databaseTables.calendarConnections)
      .select('id, user_id, status, refresh_token_enc')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const normalized = captureUnexpectedDatabaseError(error, {
        feature: 'external_calendar',
        operation: 'load_connection',
      });
      throw new ExternalCalendarServiceError('SYNC_FAILED', 'failed to load calendar connection', {
        cause: normalized,
      });
    }
    return data === null ? null : { ...data, data_generation: 0 };
  }

  // 列は明示列挙する。column-scoped grant のため select('*') は 42501 になる。
  const { data, error } = await db
    .from(databaseTables.calendarConnections)
    .select('id, user_id, status, refresh_token_enc, data_generation')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // connection を読めない = 状態を記録する術も無い。ここだけは throw して呼び出し側へ委ねる。
    const normalized = captureUnexpectedDatabaseError(error, {
      feature: 'external_calendar',
      operation: 'load_connection',
    });
    throw new ExternalCalendarServiceError('SYNC_FAILED', 'failed to load calendar connection', {
      cause: normalized,
    });
  }
  return data;
}

/**
 * 選択済みカレンダーを読む。読めなければ `null`（空の選択と区別する）。
 *
 * 失敗を空配列に畳むと、呼び出し側が「0 件を同期して成功」と解釈して
 * `last_synced_at` を進めてしまう。ユーザーからは「同期済みなのに何も入っていない」に
 * しか見えず、しかも次の run も同じ結果になるので永久に気づけない。
 */
async function loadSelectedCalendars(
  db: SyncClient,
  connectionId: string,
  userId: string,
): Promise<CalendarRow[] | null> {
  const { data, error } = await db
    .from(databaseTables.calendarConnectionCalendars)
    .select('provider_calendar_id, calendar_name, sync_token')
    .eq('connection_id', connectionId)
    .eq('user_id', userId);

  if (error) {
    captureDatabaseError(error, 'load_selected_calendars');
    return null;
  }
  return data ?? [];
}

async function upsertActiveEvents(
  db: SyncClient,
  connection: ConnectionRow,
  calendar: CalendarRow,
  events: NormalizedExternalEvent[],
  runStartedAtIso: string,
): Promise<void> {
  // 全行のキー集合を厳密に揃える。PostgREST は配列 upsert のとき全行のキーの和集合を
  // columns に送り、欠けた行は DEFAULT ではなく NULL で埋める。dismissed_at はキーに
  // 含めない（§6-2-5。ON CONFLICT DO UPDATE SET の対象列は INSERT の列と同一なので、
  // 含めなければ既存の dismissed_at が保持される）。
  const rows = events.map((event) => ({
    user_id: connection.user_id,
    provider: PROVIDER,
    connection_id: connection.id,
    provider_calendar_id: calendar.provider_calendar_id,
    provider_event_id: event.providerEventId,
    title: event.title,
    description: event.description,
    calendar_name: calendar.calendar_name,
    start_at: event.startAt,
    end_at: event.endAt,
    status: 'confirmed',
    last_synced_at: runStartedAtIso,
  }));

  const { error } = await db.from(databaseTables.externalCalendarEvents).upsert(rows, {
    onConflict: 'user_id,provider,connection_id,provider_calendar_id,provider_event_id',
  });

  if (error) throw error;
}

async function tombstoneEvents(
  db: SyncClient,
  connection: ConnectionRow,
  calendar: CalendarRow,
  providerEventIds: string[],
  runStartedAtIso: string,
): Promise<void> {
  // UPDATE であって upsert ではない。ミラーに無い id には行を作らない（未知の cancelled 通知が
  // sparse row を無限に増やすのを防ぐ）。既存の start_at / end_at / dismissed_at は残るので、
  // NULL 時刻の不滅ゴミ行が生まれず prune が効く。
  for (let i = 0; i < providerEventIds.length; i += TOMBSTONE_BATCH_SIZE) {
    const chunk = providerEventIds.slice(i, i + TOMBSTONE_BATCH_SIZE);
    const { error } = await db
      .from(databaseTables.externalCalendarEvents)
      .update({ status: 'cancelled', last_synced_at: runStartedAtIso })
      .eq('user_id', connection.user_id)
      .eq('connection_id', connection.id)
      .eq('provider_calendar_id', calendar.provider_calendar_id)
      .in('provider_event_id', chunk);

    if (error) throw error;
  }
}

async function sweepStaleEvents(
  db: SyncClient,
  connection: ConnectionRow,
  calendar: CalendarRow,
  runStartedAtIso: string,
): Promise<void> {
  // full sync が触れなかった（= provider から返らなかった = 削除された）行を cancelled 化する。
  // strict 比較 last_synced_at < runStartedAt が並行 run 安全性の要（新しい run が書いた
  // 行は消さない）。DELETE ではなく UPDATE なのは、参照済み行を消せず dismissed も残すため。
  const { error } = await db
    .from(databaseTables.externalCalendarEvents)
    .update({ status: 'cancelled', last_synced_at: runStartedAtIso })
    .eq('user_id', connection.user_id)
    .eq('connection_id', connection.id)
    .eq('provider_calendar_id', calendar.provider_calendar_id)
    .lt('last_synced_at', runStartedAtIso)
    .neq('status', 'cancelled');

  if (error) throw error;
}

async function saveSyncToken(
  db: SyncClient,
  connection: ConnectionRow,
  calendar: CalendarRow,
  syncToken: string,
  runStartedAtIso: string,
): Promise<void> {
  const { error } = await db
    .from(databaseTables.calendarConnectionCalendars)
    .update({ sync_token: syncToken, last_synced_at: runStartedAtIso })
    .eq('user_id', connection.user_id)
    .eq('connection_id', connection.id)
    .eq('provider_calendar_id', calendar.provider_calendar_id);

  if (error) throw error;
}

async function clearSyncToken(
  db: SyncClient,
  connection: ConnectionRow,
  calendar: CalendarRow,
): Promise<void> {
  const { error } = await db
    .from(databaseTables.calendarConnectionCalendars)
    .update({ sync_token: null })
    .eq('user_id', connection.user_id)
    .eq('connection_id', connection.id)
    .eq('provider_calendar_id', calendar.provider_calendar_id);

  if (error) throw error;
}

// =============================================================================
// connection 状態の更新
// =============================================================================

function reauthResult(
  outcome: Awaited<ReturnType<typeof markCalendarConnectionReauth>>,
  calendarsSynced: number,
  calendarsFailed: number,
): SyncConnectionResult {
  if (outcome === 'marked') {
    return { outcome: 'reauth_required', calendarsSynced, calendarsFailed };
  }
  if (outcome === 'missing') {
    return { outcome: 'not_configured', calendarsSynced, calendarsFailed };
  }
  if (outcome === 'superseded') {
    return { outcome: 'partial_failure', calendarsSynced, calendarsFailed };
  }
  throw new ExternalCalendarServiceError(
    'SYNC_FAILED',
    'calendar connection reauthorization is unresolved',
  );
}

async function writeConnectionError(
  db: SyncClient,
  connectionId: string,
  userId: string,
  code: SyncErrorCode,
  runStartedAtIso: string,
): Promise<void> {
  await updateConnection(db, connectionId, userId, {
    last_sync_error: code,
    last_synced_at: runStartedAtIso,
  });
}

async function writeConnectionSuccess(
  db: SyncClient,
  connectionId: string,
  userId: string,
  runStartedAtIso: string,
): Promise<void> {
  await updateConnection(db, connectionId, userId, {
    last_sync_error: null,
    last_synced_at: runStartedAtIso,
  });
}

async function updateConnection(
  db: SyncClient,
  connectionId: string,
  userId: string,
  patch: Partial<Database['public']['Tables']['calendar_connections']['Update']>,
): Promise<void> {
  const { error } = await db
    .from(databaseTables.calendarConnections)
    .update(patch)
    .eq('id', connectionId)
    .eq('user_id', userId);

  if (error) captureDatabaseError(error, 'update_connection');
}

// =============================================================================
// エラー整理
// =============================================================================

/** provider の生メッセージを外へ出さないよう、error → 安定コードに畳む。 */
function providerErrorCode(error: unknown): SyncErrorCode {
  if (error instanceof CalendarProviderError) {
    if (error.kind === 'reauth_required') return 'reauth_required';
    if (error.kind === 'rate_limited') return 'rate_limited';
  }
  return 'provider_unavailable';
}

function captureProviderError(error: unknown, operation: string): void {
  // rate_limited / cursor_invalid は想定内なので Sentry に送らない（quota を焼く増幅経路）。
  if (
    error instanceof CalendarProviderError &&
    (error.kind === 'rate_limited' || error.kind === 'cursor_invalid')
  ) {
    logger.warn('[calendar-sync] provider returned an expected error', { operation });
    return;
  }

  captureUnexpectedError(error instanceof Error ? error : new Error('provider error'), {
    feature: 'external_calendar',
    operation,
    source: 'google_calendar_api',
    // errorCode は allowlist で snake_case ASCII 相当を要求する。kind は既にその形。
    ...(error instanceof CalendarProviderError ? { errorCode: error.kind } : {}),
  });
}

function captureDatabaseError(error: unknown, operation: string): void {
  captureUnexpectedDatabaseError(error, {
    feature: 'external_calendar',
    operation,
  });
}
