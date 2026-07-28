import 'server-only';

import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';

import { resolveGoogleCalendarProjectKey } from './authority-config';
import { ExternalCalendarServiceError } from './external-calendar-service-error';
import { googleCalendarAdapter } from './providers/google';
import { CalendarProviderError } from './providers/types';
import { decryptToken, encryptToken } from './token-crypto';
import { markCalendarConnectionReauth, persistCalendarTokenRotation } from './token-rotation';

/**
 * `calendar_connections` への書き込み。
 *
 * authenticated は column-scoped SELECT しか持たない（`refresh_token_enc` /
 * `granted_scopes` / `provider_account_id` は grant 外）ので、mutation は必ず
 * service_role で行い、`user_id` を明示的に指定する。設計は overview.md §4-4。
 */

/**
 * service-role client が触れる surface を connection 系だけに narrow する。
 * `lib/oauth-server/db.ts` と同じ理由 — RLS を bypass する client が他テーブルへ
 * 到達できると cross-tenant leak になるので、compile error で止める。
 */
type CalendarConnectionDatabase = {
  public: {
    Tables: Pick<
      Database['public']['Tables'],
      'calendar_connections' | 'calendar_connection_calendars'
    >;
    Views: Record<string, never>;
    Functions: Pick<
      Database['public']['Functions'],
      | 'disconnect_calendar_connection_command_v1'
      | 'replace_selected_calendars_command_v1'
      | 'save_calendar_connection_command_v2'
    >;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type CalendarConnectionClient = SupabaseClient<CalendarConnectionDatabase>;

function createCalendarConnectionDbClient(): CalendarConnectionClient {
  return createClient<CalendarConnectionDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

const GOOGLE_PROVIDER = 'google';
const DB_RPC_TIMEOUT_MS = 4_000;
const DB_RPC_ATTEMPTS = 3;

type SaveConnectionInput = {
  attemptId: string;
  userId: string;
  /** Google の `sub`。email は可変・再利用可なので同定には使わない。 */
  providerAccountId: string;
  providerAccountEmail: string | null;
  grantedScopes: string[];
  refreshToken: string;
  encryptionKey: string;
};

type SaveConnectionOutcome = 'saved' | 'enqueued';

function resolveProjectKeyOrThrow(): string {
  const projectKey = resolveGoogleCalendarProjectKey();
  if (projectKey === null) {
    throw new ExternalCalendarServiceError(
      'UPDATE_FAILED',
      'calendar authority project is not configured',
    );
  }
  return projectKey;
}

/**
 * 接続を保存する。
 *
 * `refresh_token` が返らなかった場合はこの関数を呼ばない。既存行を残したまま
 * `status='active'` に戻すと、失効済みの token を抱えた接続が UI 上「接続済み」に見え、
 * 再認証導線が二度と出なくなる（overview.md §5-4 の reauth_required 遷移が死ぬ）。
 */
export async function saveConnection(input: SaveConnectionInput): Promise<SaveConnectionOutcome> {
  // response欠落後も同じattempt/payloadで再試行できるよう、暗号化は一度だけ行う。
  const refreshTokenEnc = encryptToken(input.refreshToken, input.encryptionKey);
  const args = {
    p_attempt_id: input.attemptId,
    p_project_key: resolveProjectKeyOrThrow(),
    p_user_id: input.userId,
    p_provider: GOOGLE_PROVIDER,
    p_provider_account_id: input.providerAccountId,
    p_provider_account_email: input.providerAccountEmail as never,
    p_granted_scopes: input.grantedScopes,
    p_refresh_token_enc: refreshTokenEnc,
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const db = createCalendarConnectionDbClient();
      const { data, error } = await db
        .rpc('save_calendar_connection_command_v2', args)
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));

      if (!error && (data === 'saved' || data === 'enqueued')) return data;
    } catch {
      // commit後のresponse欠落とrollbackを区別できない。同じciphertextで再試行する。
    }
  }

  throw new ExternalCalendarServiceError('UPDATE_FAILED', 'calendar connection save is unresolved');
}

// =============================================================================
// 読み取り（authenticated client 経由。RLS スコープ + 列明示）
// =============================================================================

/** authenticated client から見える connection の列（token 系は grant 外なので含めない）。 */
const CONNECTION_PUBLIC_COLUMNS =
  'id, provider, provider_account_email, status, last_synced_at, last_sync_error, created_at, updated_at' as const;

type CalendarConnectionSummary = {
  id: string;
  provider: string;
  provider_account_email: string | null;
  status: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type CalendarSyncStatus = {
  connection: CalendarConnectionSummary;
  calendars: Array<{
    provider_calendar_id: string;
    calendar_name: string | null;
    last_synced_at: string | null;
  }>;
};

/**
 * 接続一覧。解約後も自分の接続状態は見えるべきなので protectedProcedure から呼ぶ。
 *
 * authenticated client（RLS スコープ済み）を受け取り、`select('*')` を使わず列明示する
 * （column-scoped grant のため未 grant 列を触ると 42501）。
 */
export async function listConnections(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CalendarConnectionSummary[]> {
  const { data, error } = await supabase
    .from(databaseTables.calendarConnections)
    .select(CONNECTION_PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to list calendar connections', {
      cause: error,
    });
  }
  return data ?? [];
}

/** 接続 + 選択カレンダーの同期状況。 */
export async function getSyncStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  connectionId: string,
): Promise<CalendarSyncStatus> {
  const { data: connection, error: connectionError } = await supabase
    .from(databaseTables.calendarConnections)
    .select(CONNECTION_PUBLIC_COLUMNS)
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (connectionError) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to load connection', {
      cause: connectionError,
    });
  }
  if (!connection) {
    throw new ExternalCalendarServiceError('CONNECTION_NOT_FOUND', 'calendar connection not found');
  }

  const { data: calendars, error: calendarsError } = await supabase
    .from(databaseTables.calendarConnectionCalendars)
    .select('provider_calendar_id, calendar_name, last_synced_at')
    .eq('connection_id', connectionId)
    .eq('user_id', userId)
    .order('provider_calendar_id', { ascending: true });

  if (calendarsError) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to load selected calendars', {
      cause: calendarsError,
    });
  }

  return { connection, calendars: calendars ?? [] };
}

// =============================================================================
// mutation / provider 呼び出し（service_role client）
// =============================================================================

type SelectedCalendarInput = {
  providerCalendarId: string;
  calendarName?: string | null;
};

type ProviderCalendarOption = {
  id: string;
  name: string | null;
  primary: boolean;
  selected: boolean;
};

/** service_role で connection の token 行を読む。無ければ null。 */
async function loadConnectionSecret(
  db: CalendarConnectionClient,
  userId: string,
  connectionId: string,
): Promise<{
  authorityEpoch: number;
  authorityFenceId: string;
  dataGeneration: number;
  status: string;
  refreshTokenEnc: string;
} | null> {
  const { data, error } = await db
    .from(databaseTables.calendarConnections)
    .select('status, refresh_token_enc, data_generation, authority_fence_id, authority_epoch')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to load calendar connection', {
      cause: error,
    });
  }
  if (!data) return null;
  if (data.authority_fence_id === null || data.authority_epoch === null) {
    throw new ExternalCalendarServiceError(
      'UPDATE_FAILED',
      'calendar connection authority is not ready',
    );
  }
  return {
    authorityEpoch: data.authority_epoch,
    authorityFenceId: data.authority_fence_id,
    dataGeneration: data.data_generation,
    status: data.status,
    refreshTokenEnc: data.refresh_token_enc,
  };
}

function throwForReauthOutcome(
  outcome: Awaited<ReturnType<typeof markCalendarConnectionReauth>>,
  cause?: unknown,
): never {
  if (outcome === 'marked') {
    throw new ExternalCalendarServiceError('REAUTH_REQUIRED', 'calendar connection needs reauth', {
      cause,
    });
  }
  if (outcome === 'missing') {
    throw new ExternalCalendarServiceError(
      'CONNECTION_NOT_FOUND',
      'calendar connection no longer exists',
    );
  }
  if (outcome === 'superseded') {
    throw new ExternalCalendarServiceError(
      'PROVIDER_UNAVAILABLE',
      'calendar connection changed while reauthorization was required',
    );
  }
  throw new ExternalCalendarServiceError(
    'UPDATE_FAILED',
    'calendar connection reauthorization is unresolved',
  );
}

/**
 * provider の calendarList をオンデマンドで取得し、選択済みフラグを付けて返す。
 *
 * refresh token を読むため service_role。`reauth_required` の接続は provider を叩かず弾く。
 * rotation された refresh token は保存し直す（Step 3 と同じ規律）。
 */
export async function listProviderCalendars(
  userId: string,
  connectionId: string,
): Promise<ProviderCalendarOption[]> {
  const db = createCalendarConnectionDbClient();

  const secret = await loadConnectionSecret(db, userId, connectionId);
  if (!secret) {
    throw new ExternalCalendarServiceError('CONNECTION_NOT_FOUND', 'calendar connection not found');
  }
  if (secret.status === 'reauth_required') {
    throw new ExternalCalendarServiceError('REAUTH_REQUIRED', 'calendar connection needs reauth');
  }

  const refreshToken = decryptToken(
    secret.refreshTokenEnc,
    env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
  );

  const rotationOperationId = randomUUID();
  let session;
  try {
    session = await googleCalendarAdapter.startSession(refreshToken);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      const reauthOutcome = await markCalendarConnectionReauth({
        userId,
        connectionId,
        expectedAuthorityFenceId: secret.authorityFenceId,
        expectedAuthorityEpoch: secret.authorityEpoch,
        expectedGeneration: secret.dataGeneration,
        expectedRefreshTokenEnc: secret.refreshTokenEnc,
      });
      throwForReauthOutcome(reauthOutcome, error);
    }
    throw new ExternalCalendarServiceError('PROVIDER_UNAVAILABLE', 'failed to reach the provider', {
      cause: error,
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
      expectedAuthorityFenceId: secret.authorityFenceId,
      expectedAuthorityEpoch: secret.authorityEpoch,
      expectedGeneration: secret.dataGeneration,
      expectedRefreshTokenEnc: secret.refreshTokenEnc,
      rotatedRefreshToken: session.rotatedRefreshToken,
      encryptionKey: env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
      provider: googleCalendarAdapter,
    });
    const { outcome: rotationOutcome } = rotationResult;
    markReauthAfterRotation = rotationResult.markReauthIfCurrent;

    if (rotationOutcome === 'enqueued' || rotationOutcome === 'missing') {
      throw new ExternalCalendarServiceError(
        'CONNECTION_NOT_FOUND',
        'calendar connection no longer exists',
      );
    }

    if (rotationOutcome === 'reauth_required') {
      throw new ExternalCalendarServiceError('REAUTH_REQUIRED', 'calendar connection needs reauth');
    }
    if (rotationOutcome === 'superseded') {
      throw new ExternalCalendarServiceError(
        'PROVIDER_UNAVAILABLE',
        'calendar connection changed while token rotation was recovered',
      );
    }
    if (rotationOutcome === 'unresolved') {
      throw new ExternalCalendarServiceError(
        'UPDATE_FAILED',
        'calendar token rotation is unresolved',
      );
    }
  }

  let providerCalendars;
  try {
    providerCalendars = await googleCalendarAdapter.listCalendars(session);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      const reauthOutcome =
        markReauthAfterRotation === null
          ? await markCalendarConnectionReauth({
              userId,
              connectionId,
              expectedAuthorityFenceId: secret.authorityFenceId,
              expectedAuthorityEpoch: secret.authorityEpoch,
              expectedGeneration: secret.dataGeneration,
              expectedRefreshTokenEnc: secret.refreshTokenEnc,
            })
          : await markReauthAfterRotation();
      throwForReauthOutcome(reauthOutcome, error);
    }
    throw error;
  }

  const { data: selectedRows, error: selectedError } = await db
    .from(databaseTables.calendarConnectionCalendars)
    .select('provider_calendar_id')
    .eq('connection_id', connectionId)
    .eq('user_id', userId);

  if (selectedError) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to load selected calendars', {
      cause: selectedError,
    });
  }

  const selectedIds = new Set((selectedRows ?? []).map((row) => row.provider_calendar_id));

  return providerCalendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    primary: calendar.primary,
    selected: selectedIds.has(calendar.id),
  }));
}

/**
 * 選択カレンダーを差し替える。
 *
 * 残すカレンダーの `sync_token` は保持する（upsert payload に含めないことで既存値が残る）。
 * 外したカレンダーは子行を delete し、そのミラー行のうち未参照のものを即時掃除する
 * （ユーザーが「外した」意思をすぐ反映。参照済みは歴史的アンカーとして残す）。
 */
export async function updateSelectedCalendars(
  userId: string,
  connectionId: string,
  selected: SelectedCalendarInput[],
): Promise<void> {
  const db = createCalendarConnectionDbClient();

  const secret = await loadConnectionSecret(db, userId, connectionId);
  if (!secret) {
    throw new ExternalCalendarServiceError('CONNECTION_NOT_FOUND', 'calendar connection not found');
  }

  const args = {
    p_project_key: resolveProjectKeyOrThrow(),
    p_user_id: userId,
    p_connection_id: connectionId,
    p_expected_generation: secret.dataGeneration,
    p_expected_authority_fence_id: secret.authorityFenceId,
    p_expected_authority_epoch: secret.authorityEpoch,
    p_selected_calendars: selected.map((calendar) => ({
      providerCalendarId: calendar.providerCalendarId,
      calendarName: calendar.calendarName ?? null,
    })),
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const retryDb = createCalendarConnectionDbClient();
      const { data, error } = await retryDb
        .rpc('replace_selected_calendars_command_v1', args)
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));

      if (!error && data === 'updated') return;
      if (!error && data === 'missing') {
        throw new ExternalCalendarServiceError(
          'CONNECTION_NOT_FOUND',
          'calendar connection not found',
        );
      }
      if (!error && data === 'superseded') {
        throw new ExternalCalendarServiceError(
          'UPDATE_FAILED',
          'calendar selection was superseded',
        );
      }
    } catch (error) {
      if (error instanceof ExternalCalendarServiceError) throw error;
      // commit後のresponse欠落なら同じselection snapshotを再送する。
    }
  }

  throw new ExternalCalendarServiceError(
    'UPDATE_FAILED',
    'calendar selection replacement is unresolved',
  );
}

/**
 * 接続を切断する。
 *
 * DB commandがsubject fence、revoke outbox、未参照mirror削除、connection削除を一体化する。
 * provider HTTPはdurable outboxをclaimするworkerだけが行う。
 */
export async function disconnect(userId: string, connectionId: string): Promise<void> {
  const operationId = randomUUID();
  const args = {
    p_operation_id: operationId,
    p_project_key: resolveProjectKeyOrThrow(),
    p_user_id: userId,
    p_connection_id: connectionId,
  };

  for (let attempt = 0; attempt < DB_RPC_ATTEMPTS; attempt += 1) {
    try {
      const db = createCalendarConnectionDbClient();
      const { data, error } = await db
        .rpc('disconnect_calendar_connection_command_v1', args)
        .abortSignal(AbortSignal.timeout(DB_RPC_TIMEOUT_MS));

      if (!error && (data === 'queued' || data === 'missing')) return;
    } catch {
      // commit後のresponse欠落でも同じoperation IDを再送し、receiptをreplayする。
    }
  }

  throw new ExternalCalendarServiceError(
    'DELETE_FAILED',
    'calendar connection disconnect is unresolved',
  );
}
