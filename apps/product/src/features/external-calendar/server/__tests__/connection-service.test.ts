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
const decryptToken = vi.hoisted(() => vi.fn());
const encryptToken = vi.hoisted(() => vi.fn());
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
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));

import {
  disconnect,
  getSyncStatus,
  listConnections,
  listProviderCalendars,
  updateSelectedCalendars,
} from '../connection-service';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';

type Recorder = { table: string; chain: Array<{ method: string; args: unknown[] }> };

type Config = {
  connection?: { status: string; refresh_token_enc: string } | null;
  childRows?: Array<{ provider_calendar_id: string }>;
};

function setupServiceRoleDb(config: Config) {
  const calls: Recorder[] = [];

  function resolve(recorder: Recorder): { data: unknown; error: unknown } {
    const methods = recorder.chain.map((entry) => entry.method);
    if (recorder.table === 'calendar_connections') {
      if (methods.includes('maybeSingle')) return { data: config.connection ?? null, error: null };
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

  it('startSession の invalid_grant で status を reauth_required にして弾く', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
    });
    const { CalendarProviderError } = await import('../providers/types');
    startSession.mockRejectedValue(new CalendarProviderError('revoked', 'reauth_required'));

    await expect(listProviderCalendars(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    const update = findWith(calls, 'calendar_connections', 'update')!;
    expect(argsOf(update, 'update')[0]).toMatchObject({ status: 'reauth_required' });
  });

  it('rotation された refresh token を再暗号化して保存する', async () => {
    const { calls } = setupServiceRoleDb({
      connection: { status: 'active', refresh_token_enc: 'enc' },
    });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });

    await listProviderCalendars(USER_ID, CONNECTION_ID);

    expect(encryptToken).toHaveBeenCalledWith('rotated', expect.any(String));
    const saved = recordersFor(calls, 'calendar_connections').find((r) =>
      r.chain.some((e) => e.method === 'update' && 'refresh_token_enc' in (e.args[0] as object)),
    );
    expect(saved).toBeDefined();
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
