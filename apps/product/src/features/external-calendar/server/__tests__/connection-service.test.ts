import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ExternalCalendarServiceError } from '../external-calendar-service-error';

const createClient = vi.hoisted(() => vi.fn());
const startSession = vi.hoisted(() => vi.fn());
const listCalendars = vi.hoisted(() => vi.fn());
const revoke = vi.hoisted(() => vi.fn());
const decryptToken = vi.hoisted(() => vi.fn());
const encryptToken = vi.hoisted(() => vi.fn());
const persistCalendarTokenRotation = vi.hoisted(() => vi.fn());
const markCalendarConnectionReauth = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43) + '=',
    GOOGLE_CALENDAR_CLIENT_ID: '123456789012-dayoptcalendar.apps.googleusercontent.com',
    GOOGLE_CALENDAR_PROJECT_NUMBER: '123456789012',
  },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('../providers/google', () => ({
  googleCalendarAdapter: { provider: 'google', startSession, listCalendars, revoke },
}));
vi.mock('../token-crypto', () => ({ decryptToken, encryptToken }));
vi.mock('../token-rotation', () => ({
  persistCalendarTokenRotation,
  markCalendarConnectionReauth,
}));

import {
  disconnect,
  getSyncStatus,
  listConnections,
  listProviderCalendars,
  saveConnection,
  updateSelectedCalendars,
} from '../connection-service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';

type Recorder = { table: string; chain: Array<{ method: string; args: unknown[] }> };

type Config = {
  connection?: {
    authority_epoch?: number | null;
    authority_fence_id?: string | null;
    data_generation?: number;
    status: string;
    refresh_token_enc: string;
  } | null;
  childRows?: Array<{ provider_calendar_id: string }>;
  rpcResults?: Record<string, Array<{ data: unknown; error: unknown } | Error>>;
};

function setupServiceRoleDb(config: Config) {
  const calls: Recorder[] = [];

  function resolve(recorder: Recorder): { data: unknown; error: unknown } {
    const methods = recorder.chain.map((entry) => entry.method);
    if (recorder.table === 'calendar_connections') {
      if (methods.includes('maybeSingle')) {
        return {
          data:
            config.connection === null || config.connection === undefined
              ? null
              : {
                  authority_epoch: 2,
                  authority_fence_id: '00000000-0000-4000-8000-0000000000f1',
                  data_generation: 3,
                  ...config.connection,
                },
          error: null,
        };
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

  const counters = new Map<string, number>();
  const rpc = vi.fn((operation: string) => {
    const responses = config.rpcResults?.[operation] ?? [{ data: 'updated', error: null }];
    const index = counters.get(operation) ?? 0;
    counters.set(operation, index + 1);
    const response = responses[Math.min(index, responses.length - 1)]!;
    return {
      abortSignal: vi.fn(() =>
        response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
      ),
    };
  });

  createClient.mockReturnValue({ from, rpc });
  return { calls, rpc };
}

function recordersFor(calls: Recorder[], table: string): Recorder[] {
  return calls.filter((r) => r.table === table);
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
  startSession.mockResolvedValue({ accessToken: 'access', rotatedRefreshToken: null });
  listCalendars.mockResolvedValue([]);
  revoke.mockResolvedValue(true);
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

// =============================================================================
// listProviderCalendars
// =============================================================================

describe('listProviderCalendars', () => {
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
      expectedAuthorityFenceId: '00000000-0000-4000-8000-0000000000f1',
      expectedAuthorityEpoch: 2,
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
        expectedAuthorityFenceId: '00000000-0000-4000-8000-0000000000f1',
        expectedAuthorityEpoch: 2,
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
// saveConnection
// =============================================================================

describe('saveConnection', () => {
  it('claim済みattemptと暗号文をfenced commandへ渡す', async () => {
    const { rpc } = setupServiceRoleDb({
      rpcResults: {
        save_calendar_connection_command_v2: [{ data: 'saved', error: null }],
      },
    });

    await expect(
      saveConnection({
        attemptId: '00000000-0000-4000-8000-0000000000a1',
        userId: USER_ID,
        providerAccountId: 'google-sub',
        providerAccountEmail: null,
        grantedScopes: ['calendar.readonly'],
        refreshToken: 'plain-refresh-token',
        encryptionKey: 'encryption-key',
      }),
    ).resolves.toBe('saved');

    expect(encryptToken).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_calendar_connection_command_v2', {
      p_attempt_id: '00000000-0000-4000-8000-0000000000a1',
      p_project_key: '123456789012',
      p_user_id: USER_ID,
      p_provider: 'google',
      p_provider_account_id: 'google-sub',
      p_provider_account_email: null,
      p_granted_scopes: ['calendar.readonly'],
      p_refresh_token_enc: 'enc',
    });
  });

  it('response欠落後も同じciphertextで再試行する', async () => {
    const rpc = vi
      .fn()
      .mockReturnValueOnce({
        abortSignal: vi.fn(() => Promise.reject(new Error('response lost'))),
      })
      .mockReturnValueOnce({
        abortSignal: vi.fn(() => Promise.resolve({ data: 'saved', error: null })),
      });
    createClient.mockReturnValue({ rpc });

    await saveConnection({
      attemptId: '00000000-0000-4000-8000-0000000000a1',
      userId: USER_ID,
      providerAccountId: 'google-sub',
      providerAccountEmail: 'user@example.com',
      grantedScopes: ['calendar.readonly'],
      refreshToken: 'plain-refresh-token',
      encryptionKey: 'encryption-key',
    });

    expect(encryptToken).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
});

// =============================================================================
// updateSelectedCalendars
// =============================================================================

describe('updateSelectedCalendars', () => {
  it('選択全体をgeneration/authority-bound commandへ渡す', async () => {
    const { rpc } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      rpcResults: {
        replace_selected_calendars_command_v1: [{ data: 'updated', error: null }],
      },
    });

    await updateSelectedCalendars(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: 'A' },
    ]);

    expect(rpc).toHaveBeenCalledWith('replace_selected_calendars_command_v1', {
      p_project_key: '123456789012',
      p_user_id: USER_ID,
      p_connection_id: CONNECTION_ID,
      p_expected_generation: 3,
      p_expected_authority_fence_id: '00000000-0000-4000-8000-0000000000f1',
      p_expected_authority_epoch: 2,
      p_selected_calendars: [{ providerCalendarId: 'cal-a', calendarName: 'A' }],
    });
  });

  it('superseded writerでは更新失敗にする', async () => {
    setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      rpcResults: {
        replace_selected_calendars_command_v1: [{ data: 'superseded', error: null }],
      },
    });

    await expect(
      updateSelectedCalendars(USER_ID, CONNECTION_ID, [
        { providerCalendarId: 'cal-a', calendarName: 'A' },
      ]),
    ).rejects.toMatchObject({ code: 'UPDATE_FAILED' });
  });

  it('response欠落後も同じselection snapshotで再試行する', async () => {
    const { rpc } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
      rpcResults: {
        replace_selected_calendars_command_v1: [
          new Error('response lost'),
          { data: 'updated', error: null },
        ],
      },
    });

    await updateSelectedCalendars(USER_ID, CONNECTION_ID, [
      { providerCalendarId: 'cal-a', calendarName: 'A' },
    ]);

    const selectionCalls = rpc.mock.calls.filter(
      ([name]) => name === 'replace_selected_calendars_command_v1',
    );
    expect(selectionCalls).toHaveLength(2);
    expect(selectionCalls[0]).toEqual(selectionCalls[1]);
  });
});

// =============================================================================
// disconnect
// =============================================================================

describe('disconnect', () => {
  it('providerを直接呼ばずfenced commandへ委ねる', async () => {
    const { rpc } = setupServiceRoleDb({
      rpcResults: {
        disconnect_calendar_connection_command_v1: [{ data: 'queued', error: null }],
      },
    });

    await disconnect(USER_ID, CONNECTION_ID);

    expect(rpc).toHaveBeenCalledWith('disconnect_calendar_connection_command_v1', {
      p_operation_id: expect.any(String),
      p_project_key: '123456789012',
      p_user_id: USER_ID,
      p_connection_id: CONNECTION_ID,
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(decryptToken).not.toHaveBeenCalled();
  });

  it('接続が既に無ければ冪等に成功する', async () => {
    setupServiceRoleDb({
      rpcResults: {
        disconnect_calendar_connection_command_v1: [{ data: 'missing', error: null }],
      },
    });

    await expect(disconnect(USER_ID, CONNECTION_ID)).resolves.toBeUndefined();
  });

  it('response欠落後も同じoperation IDで再試行する', async () => {
    const rpc = vi
      .fn()
      .mockReturnValueOnce({
        abortSignal: vi.fn(() => Promise.reject(new Error('response lost'))),
      })
      .mockReturnValueOnce({
        abortSignal: vi.fn(() => Promise.resolve({ data: 'queued', error: null })),
      });
    createClient.mockReturnValue({ rpc });

    await disconnect(USER_ID, CONNECTION_ID);

    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it('DB outcomeを確定できなければExternalCalendarServiceErrorを投げる', async () => {
    const rpc = vi.fn(() => ({
      abortSignal: vi.fn(() => Promise.resolve({ data: null, error: { code: '08006' } })),
    }));
    createClient.mockReturnValue({ rpc });

    await expect(disconnect(USER_ID, CONNECTION_ID)).rejects.toBeInstanceOf(
      ExternalCalendarServiceError,
    );
  });
});
