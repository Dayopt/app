import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';

import { logger } from '@/lib/logger';

import { deleteUnreferencedEvents } from './event-pruning';
import { ExternalCalendarServiceError } from './external-calendar-service-error';
import { googleCalendarAdapter } from './providers/google';
import { CalendarProviderError } from './providers/types';
import { decryptToken, encryptToken } from './token-crypto';

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
    Functions: Record<string, never>;
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

type SaveConnectionInput = {
  userId: string;
  /** Google の `sub`。email は可変・再利用可なので同定には使わない。 */
  providerAccountId: string;
  providerAccountEmail: string | null;
  grantedScopes: string[];
  refreshToken: string;
  encryptionKey: string;
};

/**
 * 接続を保存する。
 *
 * `refresh_token` が返らなかった場合はこの関数を呼ばない。既存行を残したまま
 * `status='active'` に戻すと、失効済みの token を抱えた接続が UI 上「接続済み」に見え、
 * 再認証導線が二度と出なくなる（overview.md §5-4 の reauth_required 遷移が死ぬ）。
 */
export async function saveConnection(input: SaveConnectionInput): Promise<void> {
  const db = createCalendarConnectionDbClient();

  const { error } = await db.from(databaseTables.calendarConnections).upsert(
    {
      user_id: input.userId,
      provider: GOOGLE_PROVIDER,
      provider_account_id: input.providerAccountId,
      provider_account_email: input.providerAccountEmail,
      granted_scopes: input.grantedScopes,
      refresh_token_enc: encryptToken(input.refreshToken, input.encryptionKey),
      status: 'active',
      last_sync_error: null,
    },
    { onConflict: 'user_id,provider,provider_account_id' },
  );

  if (error) {
    // error にトークンは含まれないが、message をそのまま外へ出さない。
    throw new Error(`failed to save calendar connection: ${error.code ?? 'unknown'}`);
  }
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
): Promise<{ status: string; refreshTokenEnc: string } | null> {
  const { data, error } = await db
    .from(databaseTables.calendarConnections)
    .select('status, refresh_token_enc')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to load calendar connection', {
      cause: error,
    });
  }
  if (!data) return null;
  return { status: data.status, refreshTokenEnc: data.refresh_token_enc };
}

async function markReauthRequired(
  db: CalendarConnectionClient,
  userId: string,
  connectionId: string,
): Promise<void> {
  await db
    .from(databaseTables.calendarConnections)
    .update({ status: 'reauth_required', last_sync_error: 'reauth_required' })
    .eq('id', connectionId)
    .eq('user_id', userId);
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

  let session;
  try {
    session = await googleCalendarAdapter.startSession(refreshToken);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.kind === 'reauth_required') {
      await markReauthRequired(db, userId, connectionId);
      throw new ExternalCalendarServiceError(
        'REAUTH_REQUIRED',
        'calendar connection needs reauth',
        {
          cause: error,
        },
      );
    }
    throw new ExternalCalendarServiceError('PROVIDER_UNAVAILABLE', 'failed to reach the provider', {
      cause: error,
    });
  }

  if (session.rotatedRefreshToken !== null) {
    await persistRotatedToken(db, userId, connectionId, session.rotatedRefreshToken);
  }

  const providerCalendars = await googleCalendarAdapter.listCalendars(session);

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

async function persistRotatedToken(
  db: CalendarConnectionClient,
  userId: string,
  connectionId: string,
  rotatedRefreshToken: string,
): Promise<void> {
  const { error } = await db
    .from(databaseTables.calendarConnections)
    .update({
      refresh_token_enc: encryptToken(rotatedRefreshToken, env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? ''),
    })
    .eq('id', connectionId)
    .eq('user_id', userId);

  // 保存に失敗しても今回の一覧取得は続行する（access token は既に mint 済み）。
  if (error) logger.warn('[calendar-connection] failed to persist a rotated refresh token');
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

  const { data: existingRows, error: existingError } = await db
    .from(databaseTables.calendarConnectionCalendars)
    .select('provider_calendar_id')
    .eq('connection_id', connectionId)
    .eq('user_id', userId);

  if (existingError) {
    throw new ExternalCalendarServiceError('FETCH_FAILED', 'failed to load selected calendars', {
      cause: existingError,
    });
  }

  const selectedIds = new Set(selected.map((calendar) => calendar.providerCalendarId));
  const removedIds = (existingRows ?? [])
    .map((row) => row.provider_calendar_id)
    .filter((id) => !selectedIds.has(id));

  if (selected.length > 0) {
    // sync_token をキーに含めない → 残す行の cursor は保持され、新規行だけ NULL（= 次回 full sync）。
    const { error: upsertError } = await db.from(databaseTables.calendarConnectionCalendars).upsert(
      selected.map((calendar) => ({
        user_id: userId,
        connection_id: connectionId,
        provider_calendar_id: calendar.providerCalendarId,
        calendar_name: calendar.calendarName ?? null,
      })),
      { onConflict: 'connection_id,provider_calendar_id' },
    );

    if (upsertError) {
      throw new ExternalCalendarServiceError('UPDATE_FAILED', 'failed to save selected calendars', {
        cause: upsertError,
      });
    }
  }

  if (removedIds.length > 0) {
    const { error: deleteError } = await db
      .from(databaseTables.calendarConnectionCalendars)
      .delete()
      .eq('user_id', userId)
      .eq('connection_id', connectionId)
      .in('provider_calendar_id', removedIds);

    if (deleteError) {
      throw new ExternalCalendarServiceError('DELETE_FAILED', 'failed to remove calendars', {
        cause: deleteError,
      });
    }

    // 外したカレンダーの未参照ミラー行を即時掃除する。
    await deleteUnreferencedEvents({
      userId,
      connectionId,
      scope: { kind: 'calendars', providerCalendarIds: removedIds },
    });
  }
}

/**
 * 接続を切断する（overview.md §8 の 3 段。順序が重要）。
 *
 * 1. provider の revoke を best-effort で呼ぶ（失敗しても続行）
 * 2. connection を消す前に、未参照ミラー行を anti-join で掃除する（削除後は FK が
 *    connection_id を NULL 化してスコープを失う）
 * 3. `calendar_connections` を hard delete（子は CASCADE、参照済みミラーは connection_id が
 *    SET NULL され歴史的アンカーとして残る）
 *
 * 解約済みユーザーも切断できるよう protectedProcedure から呼ぶ。接続が既に無ければ冪等に成功。
 */
export async function disconnect(userId: string, connectionId: string): Promise<void> {
  const db = createCalendarConnectionDbClient();

  const secret = await loadConnectionSecret(db, userId, connectionId);
  if (!secret) return; // 既に切断済み。冪等。

  // 1. revoke（best-effort）。復号に失敗しても切断自体は続行する。
  try {
    const refreshToken = decryptToken(
      secret.refreshTokenEnc,
      env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
    );
    const revoked = await googleCalendarAdapter.revoke(refreshToken);
    if (!revoked) logger.warn('[calendar-connection] provider revoke was not confirmed');
  } catch {
    logger.warn('[calendar-connection] could not revoke the provider grant; continuing disconnect');
  }

  // 2. connection 削除より先にミラーを掃除する。
  await deleteUnreferencedEvents({ userId, connectionId, scope: { kind: 'connection' } });

  // 3. connection を hard delete。子テーブルは CASCADE。
  const { error } = await db
    .from(databaseTables.calendarConnections)
    .delete()
    .eq('id', connectionId)
    .eq('user_id', userId);

  if (error) {
    throw new ExternalCalendarServiceError(
      'DELETE_FAILED',
      'failed to delete calendar connection',
      {
        cause: error,
      },
    );
  }
}
