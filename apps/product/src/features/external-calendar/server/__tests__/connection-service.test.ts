import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ExternalCalendarServiceError } from '../external-calendar-service-error';

const createClient = vi.hoisted(() => vi.fn());
const deleteUnreferencedEvents = vi.hoisted(() => vi.fn());
const startSession = vi.hoisted(() => vi.fn());
const listCalendars = vi.hoisted(() => vi.fn());
const revoke = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const decryptToken = vi.hoisted(() => vi.fn());
const encryptToken = vi.hoisted(() => vi.fn());
const persistCalendarTokenRotation = vi.hoisted(() => vi.fn());
const markCalendarConnectionReauth = vi.hoisted(() => vi.fn());
const getConfiguredExternalLifecycleAppVersion = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43) + '=',
  },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('../event-pruning', () => ({ deleteUnreferencedEvents }));
vi.mock('../providers/google', () => ({
  googleCalendarAdapter: { provider: 'google', startSession, listCalendars, revoke },
}));
vi.mock('../token-crypto', () => ({ decryptToken, encryptToken }));
vi.mock('../token-rotation', () => ({
  persistCalendarTokenRotation,
  markCalendarConnectionReauth,
}));
vi.mock('@/lib/database/external-lifecycle-version', () => ({
  getConfiguredExternalLifecycleAppVersion,
}));
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError,
  captureUnexpectedDatabaseError: vi.fn(),
}));

import {
  disconnect,
  getReconnectTarget,
  getSyncStatus,
  listConnections,
  listProviderCalendars,
  reconnectExistingConnection,
  updateSelectedCalendars,
} from '../connection-service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';

type Recorder = { table: string; chain: Array<{ method: string; args: unknown[] }> };

type Config = {
  connection?: { data_generation?: number; status: string; refresh_token_enc: string } | null;
  reconnectTarget?: {
    id: string;
    provider_account_id: string;
    provider_account_email: string | null;
  } | null;
  reconnectUpdate?: { id: string } | null;
  childRows?: Array<{ provider_calendar_id: string }>;
};

function setupServiceRoleDb(config: Config) {
  const calls: Recorder[] = [];

  function resolve(recorder: Recorder): { data: unknown; error: unknown } {
    const methods = recorder.chain.map((entry) => entry.method);
    if (recorder.table === 'calendar_connections') {
      if (methods.includes('maybeSingle')) {
        if (methods.includes('update'))
          return { data: config.reconnectUpdate ?? null, error: null };
        const select = recorder.chain.find((entry) => entry.method === 'select')?.args[0];
        if (select === 'id, provider_account_id, provider_account_email') {
          return { data: config.reconnectTarget ?? null, error: null };
        }
        return { data: config.connection ?? null, error: null };
      }
      return { data: null, error: null }; // update / delete
    }
    if (recorder.table === 'calendar_connection_calendars') {
      return { data: config.childRows ?? [], error: null };
    }
    return { data: [], error: null };
  }

  const from = vi.fn((table: string) => {
    const recorder: Recorder = { table, chain: [] };
    calls.push(recorder);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (
              onF: (v: { data: unknown; error: unknown }) => unknown,
              onR?: (e: unknown) => unknown,
            ) => Promise.resolve(resolve(recorder)).then(onF, onR);
          }
          return (...args: unknown[]) => {
            recorder.chain.push({ method: prop, args });
            if (prop === 'maybeSingle' || prop === 'single') {
              return Promise.resolve(resolve(recorder));
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  });

  createClient.mockReturnValue({ from });
  return { calls };
}

function recordersFor(calls: Recorder[], table: string): Recorder[] {
  return calls.filter((r) => r.table === table);
}

function findWith(calls: Recorder[], table: string, method: string): Recorder | undefined {
  return recordersFor(calls, table).find((r) => r.chain.some((e) => e.method === method));
}

function argsOf(recorder: Recorder, method: string): unknown[] {
  const entry = recorder.chain.find((e) => e.method === method);
  if (!entry) throw new Error(`${method} not called`);
  return entry.args;
}

beforeEach(() => {
  vi.clearAllMocks();
  decryptToken.mockReturnValue('refresh-token');
  encryptToken.mockReturnValue('enc');
  persistCalendarTokenRotation.mockResolvedValue({
    outcome: 'updated',
    markReauthIfCurrent: null,
  });
  markCalendarConnectionReauth.mockResolvedValue('marked');
  getConfiguredExternalLifecycleAppVersion.mockResolvedValue(1);
  startSession.mockResolvedValue({ accessToken: 'access', rotatedRefreshToken: null });
  listCalendars.mockResolvedValue([]);
  revoke.mockResolvedValue(true);
  deleteUnreferencedEvents.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 読み取り（authenticated client）
// =============================================================================

describe('listConnections', () => {
  it('token 系を含まない列だけを明示 SELECT する', async () => {
    const query = createChainableMock([{ id: CONNECTION_ID, status: 'active' }]);
    const supabase = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;

    await listConnections(supabase, USER_ID);

    const selectArg = query.select!.mock.calls[0]?.[0] as string;
    expect(selectArg).not.toContain('*');
    expect(selectArg).not.toContain('refresh_token_enc');
    expect(selectArg).not.toContain('granted_scopes');
    expect(selectArg).toContain('status');
    expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });
});

describe('getSyncStatus', () => {
  it('接続が無ければ CONNECTION_NOT_FOUND', async () => {
    const query = createChainableMock(null);
    const supabase = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;

    await expect(getSyncStatus(supabase, USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code: 'CONNECTION_NOT_FOUND',
    });
  });
});

describe('reconnect contract', () => {
  it('対象読取を id / user / provider / reauth_required で限定する', async () => {
    const { calls } = setupServiceRoleDb({
      reconnectTarget: {
        id: CONNECTION_ID,
        provider_account_id: 'google-sub-123',
        provider_account_email: 'owner@example.com',
      },
    });

    // email は同意画面の login_hint に載せるためだけに返す（一致判定は sub が担う）。
    await expect(getReconnectTarget(USER_ID, CONNECTION_ID)).resolves.toEqual({
      id: CONNECTION_ID,
      providerAccountId: 'google-sub-123',
      providerAccountEmail: 'owner@example.com',
    });

    const query = findWith(calls, 'calendar_connections', 'maybeSingle');
    if (!query) throw new Error('reconnect target query not found');
    expect(query.chain.filter((entry) => entry.method === 'eq').map((entry) => entry.args)).toEqual(
      [
        ['id', CONNECTION_ID],
        ['user_id', USER_ID],
        ['provider', 'google'],
        ['status', 'reauth_required'],
      ],
    );
  });

  it('再接続は安定 sub を含む条件付き UPDATE だけを実行する', async () => {
    const { calls } = setupServiceRoleDb({ reconnectUpdate: { id: CONNECTION_ID } });

    await expect(
      reconnectExistingConnection({
        connectionId: CONNECTION_ID,
        userId: USER_ID,
        providerAccountId: 'google-sub-123',
        providerAccountEmail: 'user@example.com',
        grantedScopes: ['calendar.readonly'],
        refreshToken: 'new-refresh-token',
        encryptionKey: 'encryption-key',
      }),
    ).resolves.toBe('updated');

    const update = findWith(calls, 'calendar_connections', 'update');
    if (!update) throw new Error('reconnect update not found');
    expect(argsOf(update, 'update')[0]).toEqual({
      provider_account_email: 'user@example.com',
      granted_scopes: ['calendar.readonly'],
      refresh_token_enc: 'enc',
      status: 'active',
      last_sync_error: null,
    });
    expect(
      update.chain.filter((entry) => entry.method === 'eq').map((entry) => entry.args),
    ).toEqual([
      ['id', CONNECTION_ID],
      ['user_id', USER_ID],
      ['provider', 'google'],
      ['provider_account_id', 'google-sub-123'],
      ['status', 'reauth_required'],
    ]);
    expect(findWith(calls, 'calendar_connections', 'upsert')).toBeUndefined();
  });

  it('切断との競合で更新行が無ければ missing とし、新規行を作らない', async () => {
    const { calls } = setupServiceRoleDb({ reconnectUpdate: null });

    await expect(
      reconnectExistingConnection({
        connectionId: CONNECTION_ID,
        userId: USER_ID,
        providerAccountId: 'google-sub-123',
        providerAccountEmail: null,
        grantedScopes: ['calendar.readonly'],
        refreshToken: 'new-refresh-token',
        encryptionKey: 'encryption-key',
      }),
    ).resolves.toBe('missing');

    expect(findWith(calls, 'calendar_connections', 'upsert')).toBeUndefined();
  });
});

// =============================================================================
// listProviderCalendars
// =============================================================================

describe('listProviderCalendars', () => {
  it('旧DBでは追加前の列だけをSELECTする', async () => {
    getConfiguredExternalLifecycleAppVersion.mockResolvedValue(0);
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
    });

    await listProviderCalendars(USER_ID, CONNECTION_ID);

    const connection = findWith(calls, 'calendar_connections', 'maybeSingle');
    if (connection === undefined) throw new Error('connection query not found');
    expect(argsOf(connection, 'select')).toEqual(['status, refresh_token_enc']);
  });

  it('選択済みカレンダーに selected=true を付ける', async () => {
    setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      childRows: [{ provider_calendar_id: 'cal-a' }],
    });
    listCalendars.mockResolvedValue([
      { id: 'cal-a', name: 'A', primary: true },
      { id: 'cal-b', name: 'B', primary: false },
    ]);

    const result = await listProviderCalendars(USER_ID, CONNECTION_ID);

    expect(result).toEqual([
      { id: 'cal-a', name: 'A', primary: true, selected: true },
      { id: 'cal-b', name: 'B', primary: false, selected: false },
    ]);
  });

  it('reauth_required の接続は provider を叩かず REAUTH_REQUIRED', async () => {
    setupServiceRoleDb({ connection: { status: 'reauth_required', refresh_token_enc: 'enc' } });

    await expect(listProviderCalendars(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('startSession の invalid_grant で観測authorityを reauth_required にして弾く', async () => {
    setupServiceRoleDb({
      connection: { data_generation: 3, status: 'active', refresh_token_enc: 'enc' },
    });
    const { CalendarProviderError } = await import('../providers/types');
    startSession.mockRejectedValue(new CalendarProviderError('revoked', 'reauth_required'));

    await expect(listProviderCalendars(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(markCalendarConnectionReauth).toHaveBeenCalledWith({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      expectedGeneration: 3,
      expectedRefreshTokenEnc: 'enc',
    });
  });

  it('rotation された refresh token をgeneration-bound RPCで保存する', async () => {
    setupServiceRoleDb({
      connection: { data_generation: 3, status: 'active', refresh_token_enc: 'enc' },
    });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });

    await listProviderCalendars(USER_ID, CONNECTION_ID);

    expect(persistCalendarTokenRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        connectionId: CONNECTION_ID,
        expectedGeneration: 3,
        expectedRefreshTokenEnc: 'enc',
        rotatedRefreshToken: 'rotated',
        provider: expect.any(Object),
      }),
    );
    expect(listCalendars).toHaveBeenCalled();
  });

  it('rotation更新後のprovider 401を同じ新authorityの証明で再認証へ収束する', async () => {
    setupServiceRoleDb({
      connection: { data_generation: 3, status: 'active', refresh_token_enc: 'enc' },
    });
    const markRotatedAuthority = vi.fn().mockResolvedValue('marked');
    const { CalendarProviderError } = await import('../providers/types');
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'updated',
      markReauthIfCurrent: markRotatedAuthority,
    });
    listCalendars.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 401),
    );

    await expect(listProviderCalendars(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });

    expect(markRotatedAuthority).toHaveBeenCalledTimes(1);
    expect(markCalendarConnectionReauth).not.toHaveBeenCalled();
  });

  it('purge後outboxへ退避したrotationではprovider一覧を返さない', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { data_generation: 3, status: 'active', refresh_token_enc: 'enc' },
    });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'enqueued',
      markReauthIfCurrent: null,
    });

    await expect(listProviderCalendars(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code: 'CONNECTION_NOT_FOUND',
    });
    expect(listCalendars).not.toHaveBeenCalled();
    expect(recordersFor(calls, 'calendar_connection_calendars')).toHaveLength(0);
  });

  it.each([
    ['reauth_required', 'REAUTH_REQUIRED'],
    ['missing', 'CONNECTION_NOT_FOUND'],
    ['superseded', 'PROVIDER_UNAVAILABLE'],
    ['unresolved', 'UPDATE_FAILED'],
  ] as const)('rotation結果が%sならprovider処理を止めて%sへ写像する', async (outcome, code) => {
    setupServiceRoleDb({
      connection: { data_generation: 3, status: 'active', refresh_token_enc: 'enc' },
    });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome,
      markReauthIfCurrent: null,
    });

    await expect(listProviderCalendars(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code,
    });
    expect(listCalendars).not.toHaveBeenCalled();
  });
});

// =============================================================================
// updateSelectedCalendars
// =============================================================================

describe('updateSelectedCalendars', () => {
  it('選択を upsert し、sync_token をキーに含めない（残す行の cursor 保持）', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      childRows: [{ provider_calendar_id: 'cal-a' }],
    });

    await updateSelectedCalendars(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: 'A' },
    ]);

    const upsert = findWith(calls, 'calendar_connection_calendars', 'upsert')!;
    const [rows, options] = argsOf(upsert, 'upsert') as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];
    expect(options.onConflict).toBe('connection_id,provider_calendar_id');
    for (const row of rows) {
      expect(Object.prototype.hasOwnProperty.call(row, 'sync_token')).toBe(false);
    }
  });

  it('外したカレンダーの子行を delete し、そのミラーを即時掃除する', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      childRows: [{ provider_calendar_id: 'cal-a' }, { provider_calendar_id: 'cal-b' }],
    });

    // cal-b を外す
    await updateSelectedCalendars(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: 'A' },
    ]);

    const childDelete = findWith(calls, 'calendar_connection_calendars', 'delete')!;
    expect(argsOf(childDelete, 'in')).toEqual(['provider_calendar_id', ['cal-b']]);
    expect(deleteUnreferencedEvents).toHaveBeenCalledWith({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'calendars', providerCalendarIds: ['cal-b'] },
    });
  });

  it('外した行が無ければミラー掃除を呼ばない', async () => {
    setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      childRows: [{ provider_calendar_id: 'cal-a' }],
    });

    await updateSelectedCalendars(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: 'A' },
    ]);

    expect(deleteUnreferencedEvents).not.toHaveBeenCalled();
  });
});

// =============================================================================
// disconnect
// =============================================================================

describe('disconnect', () => {
  it('revoke → prune → connection 削除 の順で実行する', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
    });

    let prunedBeforeConnectionDelete = false;
    deleteUnreferencedEvents.mockImplementation(async () => {
      // prune 呼び出し時点で connection の delete はまだ発行されていないはず（§8 順序）
      prunedBeforeConnectionDelete = !calls.some(
        (r) => r.table === 'calendar_connections' && r.chain.some((e) => e.method === 'delete'),
      );
    });

    await disconnect(USER_ID, CONNECTION_ID);

    expect(revoke).toHaveBeenCalledWith('refresh-token');
    expect(deleteUnreferencedEvents).toHaveBeenCalledWith({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'connection' },
    });
    expect(prunedBeforeConnectionDelete).toBe(true);
    expect(findWith(calls, 'calendar_connections', 'delete')).toBeDefined();
  });

  it('接続が既に無ければ冪等に何もしない', async () => {
    setupServiceRoleDb({ connection: null });

    await disconnect(USER_ID, CONNECTION_ID);

    expect(revoke).not.toHaveBeenCalled();
    expect(deleteUnreferencedEvents).not.toHaveBeenCalled();
  });

  // 失効しなかった grant =「切ったつもりなのに Google 側は生きている」。log だけでは
  // 誰も気づけないので alert に回す（Step 7）
  it.each([
    ['revoke が確定しない', () => revoke.mockResolvedValue(false)],
    [
      'revoke が例外で落ちる',
      () => revoke.mockRejectedValue(new Error('revoke endpoint unreachable')),
    ],
  ])('%s 時は切断を続けつつ Sentry へ送る', async (_label, arrange) => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
    });
    arrange();

    await disconnect(USER_ID, CONNECTION_ID);

    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'disconnect_revoke' }),
    );
    // 切断そのものはユーザーの意思なので止めない
    expect(deleteUnreferencedEvents).toHaveBeenCalled();
    expect(findWith(calls, 'calendar_connections', 'delete')).toBeDefined();
  });

  it('revoke が確定した切断では Sentry へ送らない', async () => {
    setupServiceRoleDb({ connection: { status: 'active', refresh_token_enc: 'enc' } });

    await disconnect(USER_ID, CONNECTION_ID);

    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('復号に失敗しても切断を続行する（revoke は諦める）', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
    });
    decryptToken.mockImplementation(() => {
      throw new Error('bad key');
    });

    await disconnect(USER_ID, CONNECTION_ID);

    expect(revoke).not.toHaveBeenCalled();
    expect(deleteUnreferencedEvents).toHaveBeenCalled();
    expect(findWith(calls, 'calendar_connections', 'delete')).toBeDefined();
  });

  it('接続削除の DB 失敗は ExternalCalendarServiceError を投げる', async () => {
    setupServiceRoleDb({ connection: { status: 'active', refresh_token_enc: 'enc' } });
    // connection delete を失敗させるため resolve を差し替える必要があるが、ここでは
    // deleteConnectionError を使わずに throw 経路の存在だけ確認する形にはできないので、
    // 代わりに削除エラーを返す最小構成にする。
    const failingFrom = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const proxy: unknown = new Proxy(chain, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const isConnectionDelete = table === 'calendar_connections';
            return (onF: (v: { data: unknown; error: unknown }) => unknown) =>
              Promise.resolve(
                isConnectionDelete
                  ? { data: null, error: { code: '55000' } }
                  : { data: null, error: null },
              ).then(onF);
          }
          return (..._args: unknown[]) => {
            if (prop === 'maybeSingle') {
              return Promise.resolve({
                data: { status: 'active', refresh_token_enc: 'enc' },
                error: null,
              });
            }
            return proxy;
          };
        },
      });
      return proxy;
    });
    createClient.mockReturnValue({ from: failingFrom });

    await expect(disconnect(USER_ID, CONNECTION_ID)).rejects.toBeInstanceOf(
      ExternalCalendarServiceError,
    );
  });
});
