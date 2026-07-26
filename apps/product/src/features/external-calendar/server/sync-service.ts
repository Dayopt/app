import 'server-only';

import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import { databaseTables, type Database } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError, captureUnexpectedError } from '@/lib/sentry';

import { resolveGoogleCalendarProjectKey } from './authority-config';
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

const DB_REQUEST_TIMEOUT_MS = 15_000;
const DB_RPC_ATTEMPTS = 3;
const WINDOW_RADIUS_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_RESULT_ITEMS = 10_000;

const BEGIN_SYNC_RPC = 'begin_calendar_sync_run_v1' as const;
const CLEAR_CURSOR_RPC = 'clear_calendar_sync_cursor_command_v1' as const;
const PERSIST_RESULT_RPC = 'persist_calendar_sync_result_command_v1' as const;
const FINISH_SYNC_RPC = 'finish_calendar_sync_run_v1' as const;

type SyncErrorCode =
  | 'reauth_required'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'encryption_key_invalid'
  | 'partial_failure';

type SyncOutcome =
  | 'synced'
  | 'skipped_reauth_required'
  | 'reauth_required'
  | 'encryption_key_invalid'
  | 'partial_failure'
  | 'not_configured'
  | 'superseded';

type SyncConnectionResult = {
  outcome: SyncOutcome;
  calendarsSynced: number;
  calendarsFailed: number;
};

type SyncDatabase = {
  public: {
    Tables: Pick<Database['public']['Tables'], 'calendar_connection_calendars'>;
    Views: Record<string, never>;
    Functions: Pick<
      Database['public']['Functions'],
      | typeof BEGIN_SYNC_RPC
      | typeof CLEAR_CURSOR_RPC
      | typeof FINISH_SYNC_RPC
      | typeof PERSIST_RESULT_RPC
    >;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type SyncClient = SupabaseClient<SyncDatabase>;

type SyncRunIdentity = {
  authorityEpoch: number;
  authorityFenceId: string;
  connectionId: string;
  dataGeneration: number;
  projectKey: string;
  refreshTokenEnc: string;
  runStartedAt: string;
  syncSequence: number;
  userId: string;
};

type CalendarRow = {
  id: string;
  provider_calendar_id: string;
  sync_token: string | null;
};

type BeginSyncResult =
  | { outcome: 'started'; run: SyncRunIdentity }
  | { outcome: 'missing' | 'reauth_required' | 'superseded' };

type CalendarSyncOutcome = 'synced' | 'reauth_required' | 'failed' | 'missing' | 'superseded';

function createSyncDbClient(): SyncClient {
  return createClient<SyncDatabase>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (url, options) =>
        fetch(url, {
          ...options,
          signal: options?.signal ?? AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS),
        }),
    },
  });
}

function resolveProjectKeyOrThrow(): string {
  const projectKey = resolveGoogleCalendarProjectKey();
  if (projectKey === null) {
    throw new ExternalCalendarServiceError(
      'SYNC_FAILED',
      'calendar authority project is not configured',
    );
  }
  return projectKey;
}

/**
 * 1 接続を同期する。
 *
 * begin RPC が返す generation / fence / epoch / sequence / DB timestamp を run identity とし、
 * event・cursor・status の全 write を同じ identity に束縛する。選択変更、切断、purge、
 * reconnect、新しい sync run が先行した場合は `superseded` で静かに停止する。
 */
export async function syncConnection(params: {
  connectionId: string;
  userId: string;
  forceFullSync?: boolean;
}): Promise<SyncConnectionResult> {
  const { connectionId, userId, forceFullSync = false } = params;
  const adapter: CalendarProviderAdapter = googleCalendarAdapter;

  const begin = await beginSyncRun(userId, connectionId);
  if (begin.outcome !== 'started') {
    if (begin.outcome === 'missing') return emptyResult('not_configured');
    if (begin.outcome === 'reauth_required') return emptyResult('skipped_reauth_required');
    return emptyResult('superseded');
  }

  const { run } = begin;
  const calendars = await loadSelectedCalendars(createSyncDbClient(), run);
  const runStartedAt = new Date(run.runStartedAt);
  const window: SyncWindow = {
    timeMin: new Date(runStartedAt.getTime() - WINDOW_RADIUS_MS).toISOString(),
    timeMax: new Date(runStartedAt.getTime() + WINDOW_RADIUS_MS).toISOString(),
  };

  let refreshToken: string;
  try {
    refreshToken = decryptToken(run.refreshTokenEnc, env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '');
  } catch {
    captureUnexpectedError(new Error('calendar refresh token decryption failed'), {
      feature: 'external_calendar',
      operation: 'decrypt_refresh_token',
    });
    return await finishWithOutcome(run, 'encryption_key_invalid', false, window, {
      outcome: 'encryption_key_invalid',
      calendarsSynced: 0,
      calendarsFailed: 0,
    });
  }

  const rotationOperationId = randomUUID();
  let session: ProviderSession;
  try {
    session = await adapter.startSession(refreshToken);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      const reauthOutcome = await markCalendarConnectionReauth({
        userId,
        connectionId,
        expectedAuthorityFenceId: run.authorityFenceId,
        expectedAuthorityEpoch: run.authorityEpoch,
        expectedGeneration: run.dataGeneration,
        expectedRefreshTokenEnc: run.refreshTokenEnc,
        lastSyncedAt: run.runStartedAt,
      });
      return reauthResult(reauthOutcome, 0, 0);
    }

    captureProviderError(error, 'start_session');
    return await finishWithOutcome(run, providerErrorCode(error), false, window, {
      outcome: 'partial_failure',
      calendarsSynced: 0,
      calendarsFailed: 0,
    });
  }

  let markReauthAfterRotation: Awaited<
    ReturnType<typeof persistCalendarTokenRotation>
  >['markReauthIfCurrent'] = null;

  if (session.rotatedRefreshToken !== null) {
    const rotationResult = await persistCalendarTokenRotation({
      operationId: rotationOperationId,
      userId,
      connectionId,
      expectedAuthorityFenceId: run.authorityFenceId,
      expectedAuthorityEpoch: run.authorityEpoch,
      expectedGeneration: run.dataGeneration,
      expectedRefreshTokenEnc: run.refreshTokenEnc,
      rotatedRefreshToken: session.rotatedRefreshToken,
      encryptionKey: env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
      provider: adapter,
      lastSyncedAt: run.runStartedAt,
    });
    markReauthAfterRotation = rotationResult.markReauthIfCurrent;

    if (rotationResult.outcome === 'enqueued' || rotationResult.outcome === 'missing') {
      return emptyResult('not_configured');
    }
    if (rotationResult.outcome === 'reauth_required') {
      return emptyResult('reauth_required');
    }
    if (rotationResult.outcome === 'superseded') {
      return emptyResult('superseded');
    }
    if (rotationResult.outcome === 'unresolved') {
      throw new ExternalCalendarServiceError(
        'SYNC_FAILED',
        'calendar token rotation is unresolved',
      );
    }
  }

  let calendarsSynced = 0;
  let calendarsFailed = 0;

  for (const calendar of calendars) {
    const outcome = await syncOneCalendar({
      adapter,
      calendar,
      forceFullSync,
      run,
      session,
      window,
    });

    if (outcome === 'synced') {
      calendarsSynced += 1;
      continue;
    }
    if (outcome === 'failed') {
      calendarsFailed += 1;
      continue;
    }
    if (outcome === 'missing') {
      return { outcome: 'not_configured', calendarsSynced, calendarsFailed };
    }
    if (outcome === 'superseded') {
      return { outcome: 'superseded', calendarsSynced, calendarsFailed };
    }

    const reauthOutcome =
      markReauthAfterRotation === null
        ? await markCalendarConnectionReauth({
            userId,
            connectionId,
            expectedAuthorityFenceId: run.authorityFenceId,
            expectedAuthorityEpoch: run.authorityEpoch,
            expectedGeneration: run.dataGeneration,
            expectedRefreshTokenEnc: run.refreshTokenEnc,
            lastSyncedAt: run.runStartedAt,
          })
        : await markReauthAfterRotation();
    return reauthResult(reauthOutcome, calendarsSynced, calendarsFailed);
  }

  const lastSyncError = calendarsFailed > 0 ? 'partial_failure' : null;
  return await finishWithOutcome(run, lastSyncError, true, window, {
    outcome: calendarsFailed > 0 ? 'partial_failure' : 'synced',
    calendarsSynced,
    calendarsFailed,
  });
}

async function beginSyncRun(userId: string, connectionId: string): Promise<BeginSyncResult> {
  const projectKey = resolveProjectKeyOrThrow();
  const args = {
    p_project_key: projectKey,
    p_user_id: userId,
    p_connection_id: connectionId,
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const db = createSyncDbClient();
      const { data, error } = await db
        .rpc(BEGIN_SYNC_RPC, args)
        .abortSignal(AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS));
      const row = data?.[0];
      if (!error && row !== undefined) {
        if (
          row.result === 'started' &&
          row.authority_fence_id &&
          row.run_started_at &&
          row.refresh_token_enc
        ) {
          return {
            outcome: 'started',
            run: {
              authorityEpoch: row.authority_epoch,
              authorityFenceId: row.authority_fence_id,
              connectionId,
              dataGeneration: row.data_generation,
              projectKey,
              refreshTokenEnc: row.refresh_token_enc,
              runStartedAt: row.run_started_at,
              syncSequence: row.sync_sequence,
              userId,
            },
          };
        }
        if (
          row.result === 'missing' ||
          row.result === 'reauth_required' ||
          row.result === 'superseded'
        ) {
          return { outcome: row.result };
        }
      }
    } catch {
      // response欠落後は新しいsequenceをissueし、返却できた最新runだけをproviderへ進める。
    }
  }

  captureSyncRpcFailure('begin_sync_run');
  throw new ExternalCalendarServiceError('SYNC_FAILED', 'calendar sync run could not be started');
}

async function loadSelectedCalendars(db: SyncClient, run: SyncRunIdentity): Promise<CalendarRow[]> {
  const { data, error } = await db
    .from(databaseTables.calendarConnectionCalendars)
    .select('id, provider_calendar_id, sync_token')
    .eq('connection_id', run.connectionId)
    .eq('user_id', run.userId);

  if (error) {
    const normalized = captureUnexpectedDatabaseError(error, {
      feature: 'external_calendar',
      operation: 'load_selected_calendars',
    });
    throw new ExternalCalendarServiceError('SYNC_FAILED', 'failed to load selected calendars', {
      cause: normalized,
    });
  }
  return data ?? [];
}

async function syncOneCalendar(args: {
  adapter: CalendarProviderAdapter;
  calendar: CalendarRow;
  forceFullSync: boolean;
  run: SyncRunIdentity;
  session: ProviderSession;
  window: SyncWindow;
}): Promise<CalendarSyncOutcome> {
  const { adapter, calendar, forceFullSync, run, session, window } = args;
  const cursor = forceFullSync ? null : calendar.sync_token;

  let result: Awaited<ReturnType<CalendarProviderAdapter['syncCalendar']>>;
  try {
    result = await adapter.syncCalendar(session, {
      calendarId: calendar.provider_calendar_id,
      cursor,
      window,
    });

    if (result.cursorInvalid) {
      if (cursor === null) return 'failed';

      const clearOutcome = await clearCalendarCursor(run, calendar, cursor);
      if (clearOutcome === 'missing') return 'missing';
      if (clearOutcome !== 'cleared') return 'superseded';

      result = await adapter.syncCalendar(session, {
        calendarId: calendar.provider_calendar_id,
        cursor: null,
        window,
      });
      if (result.cursorInvalid) return 'failed';
    }
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      return 'reauth_required';
    }
    captureProviderError(error, 'sync_calendar');
    return 'failed';
  }

  const payload = preparePersistPayload(result.events, [
    ...result.cancelledEventIds,
    ...result.skippedEventIds,
  ]);
  if (
    payload.events.length > MAX_RESULT_ITEMS ||
    payload.tombstoneEventIds.length > MAX_RESULT_ITEMS
  ) {
    captureUnexpectedError(new Error('calendar sync result exceeds atomic persistence limit'), {
      feature: 'external_calendar',
      operation: 'persist_calendar_result',
    });
    return 'failed';
  }

  return await persistCalendarResult(run, calendar, {
    events: payload.events,
    nextCursor: result.nextCursor,
    tombstoneEventIds: payload.tombstoneEventIds,
    usedFullSync: result.usedFullSync,
  });
}

function preparePersistPayload(
  events: NormalizedExternalEvent[],
  tombstoneEventIds: string[],
): { events: NormalizedExternalEvent[]; tombstoneEventIds: string[] } {
  const eventsById = new Map(events.map((event) => [event.providerEventId, event]));
  const tombstones = new Set(
    tombstoneEventIds.filter((eventId) => eventId.length > 0 && !eventsById.has(eventId)),
  );
  return {
    events: [...eventsById.values()],
    tombstoneEventIds: [...tombstones],
  };
}

async function clearCalendarCursor(
  run: SyncRunIdentity,
  calendar: CalendarRow,
  expectedSyncToken: string,
): Promise<'cleared' | 'missing' | 'missing_selection' | 'superseded'> {
  const args = {
    ...runFenceArgs(run),
    p_calendar_selection_id: calendar.id,
    p_provider_calendar_id: calendar.provider_calendar_id,
    p_expected_sync_token: expectedSyncToken,
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const db = createSyncDbClient();
      const { data, error } = await db
        .rpc(CLEAR_CURSOR_RPC, args)
        .abortSignal(AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS));
      if (
        !error &&
        (data === 'cleared' ||
          data === 'missing' ||
          data === 'missing_selection' ||
          data === 'superseded')
      ) {
        return data;
      }
    } catch {
      // 同じcursor snapshotを再送する。commit済みならsupersededとなりfull retryはしない。
    }
  }

  captureSyncRpcFailure('clear_sync_cursor');
  throw new ExternalCalendarServiceError('SYNC_FAILED', 'calendar sync cursor is unresolved');
}

async function persistCalendarResult(
  run: SyncRunIdentity,
  calendar: CalendarRow,
  result: {
    events: NormalizedExternalEvent[];
    nextCursor: string | null;
    tombstoneEventIds: string[];
    usedFullSync: boolean;
  },
): Promise<CalendarSyncOutcome> {
  const args = {
    ...runFenceArgs(run),
    p_calendar_selection_id: calendar.id,
    p_provider_calendar_id: calendar.provider_calendar_id,
    p_run_started_at: run.runStartedAt,
    p_events: result.events,
    p_tombstone_event_ids: result.tombstoneEventIds,
    p_used_full_sync: result.usedFullSync,
    p_next_cursor: result.nextCursor as never,
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const db = createSyncDbClient();
      const { data, error } = await db
        .rpc(PERSIST_RESULT_RPC, args)
        .abortSignal(AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS));
      if (!error && data === 'persisted') return 'synced';
      if (!error && data === 'missing') return 'missing';
      if (!error && (data === 'missing_selection' || data === 'superseded')) {
        return 'superseded';
      }
    } catch {
      // providerは再実行せず、同じrun identityとresultだけを再送する。
    }
  }

  captureSyncRpcFailure('persist_sync_result');
  throw new ExternalCalendarServiceError('SYNC_FAILED', 'calendar sync result is unresolved');
}

async function finishWithOutcome(
  run: SyncRunIdentity,
  lastSyncError: SyncErrorCode | null,
  pruneWindow: boolean,
  window: SyncWindow,
  finishedResult: SyncConnectionResult,
): Promise<SyncConnectionResult> {
  const outcome = await finishSyncRun(run, lastSyncError, pruneWindow, window);
  if (outcome === 'finished') return finishedResult;
  if (outcome === 'missing') {
    return {
      outcome: 'not_configured',
      calendarsSynced: finishedResult.calendarsSynced,
      calendarsFailed: finishedResult.calendarsFailed,
    };
  }
  return {
    outcome: 'superseded',
    calendarsSynced: finishedResult.calendarsSynced,
    calendarsFailed: finishedResult.calendarsFailed,
  };
}

async function finishSyncRun(
  run: SyncRunIdentity,
  lastSyncError: SyncErrorCode | null,
  pruneWindow: boolean,
  window: SyncWindow,
): Promise<'finished' | 'missing' | 'superseded'> {
  const args = {
    ...runFenceArgs(run),
    p_run_started_at: run.runStartedAt,
    p_last_sync_error: lastSyncError as never,
    p_prune_window: pruneWindow,
    p_not_before: (pruneWindow ? window.timeMin : null) as never,
    p_not_after: (pruneWindow ? window.timeMax : null) as never,
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const db = createSyncDbClient();
      const { data, error } = await db
        .rpc(FINISH_SYNC_RPC, args)
        .abortSignal(AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS));
      if (!error && (data === 'finished' || data === 'missing' || data === 'superseded')) {
        return data;
      }
    } catch {
      // providerを再実行せず、同じrun completionだけを再送する。
    }
  }

  captureSyncRpcFailure('finish_sync_run');
  throw new ExternalCalendarServiceError('SYNC_FAILED', 'calendar sync completion is unresolved');
}

function runFenceArgs(run: SyncRunIdentity) {
  return {
    p_project_key: run.projectKey,
    p_user_id: run.userId,
    p_connection_id: run.connectionId,
    p_expected_generation: run.dataGeneration,
    p_expected_authority_fence_id: run.authorityFenceId,
    p_expected_authority_epoch: run.authorityEpoch,
    p_expected_sync_sequence: run.syncSequence,
  };
}

function emptyResult(outcome: SyncOutcome): SyncConnectionResult {
  return { outcome, calendarsSynced: 0, calendarsFailed: 0 };
}

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
    return { outcome: 'superseded', calendarsSynced, calendarsFailed };
  }
  throw new ExternalCalendarServiceError(
    'SYNC_FAILED',
    'calendar connection reauthorization is unresolved',
  );
}

function providerErrorCode(error: unknown): SyncErrorCode {
  if (error instanceof CalendarProviderError) {
    if (error.kind === 'reauth_required') return 'reauth_required';
    if (error.kind === 'rate_limited') return 'rate_limited';
  }
  return 'provider_unavailable';
}

function captureProviderError(error: unknown, operation: string): void {
  if (
    error instanceof CalendarProviderError &&
    (error.kind === 'rate_limited' || error.kind === 'cursor_invalid')
  ) {
    logger.warn('[calendar-sync] provider returned an expected error', { operation });
    return;
  }

  captureUnexpectedError(new Error('calendar provider operation failed'), {
    feature: 'external_calendar',
    operation,
    source: 'google_calendar_api',
    ...(error instanceof CalendarProviderError ? { errorCode: error.kind } : {}),
  });
}

function captureSyncRpcFailure(operation: string): void {
  captureUnexpectedError(new Error('calendar sync authority RPC is unresolved'), {
    feature: 'external_calendar',
    operation,
    source: 'supabase_rpc',
  });
}
