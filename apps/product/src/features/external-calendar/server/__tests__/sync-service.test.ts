import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarProviderError } from '../providers/types';

/**
 * sync-service のテスト。
 *
 * overview.md §13 が必須と定める regression test 2 件（dismissed 不可侵 / prune anti-join）を
 * 含む。Supabase client は table + operation ごとに返り値を差し替えられる専用 mock で組む。
 */

const startSession = vi.hoisted(() => vi.fn());
const syncCalendar = vi.hoisted(() => vi.fn());
const decryptToken = vi.hoisted(() => vi.fn());
const encryptToken = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn((error: unknown) => error));
const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43) + '=',
  },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError, captureUnexpectedDatabaseError }));
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../token-crypto', () => ({ decryptToken, encryptToken }));
vi.mock('../providers/google', () => ({
  googleCalendarAdapter: { provider: 'google', startSession, syncCalendar },
}));

import { syncConnection } from '../sync-service';

const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CALENDAR_ID = 'primary';
const RUN_ISO = '2026-07-24T00:00:00.000Z';
const UPSERT_ON_CONFLICT = 'user_id,provider,connection_id,provider_calendar_id,provider_event_id';

type QueryResult = { data: unknown; error: unknown };

type Recorder = { table: string; chain: Array<{ method: string; args: unknown[] }> };

type DbConfig = {
  connection?: Record<string, unknown> | null;
  connectionError?: unknown;
  calendars?: Array<Record<string, unknown>>;
  pruneCandidates?: Array<{ id: string }>;
  referencedByPlans?: Array<{ external_calendar_event_id: string | null }>;
  referencedByRecords?: Array<{ external_calendar_event_id: string | null }>;
  upsertError?: unknown;
  deleteError?: unknown;
};

function setupDb(config: DbConfig) {
  const calls: Recorder[] = [];
  const counters = { pruneSelect: 0 };

  function resolve(recorder: Recorder): QueryResult {
    const { table } = recorder;
    const methods = recorder.chain.map((entry) => entry.method);

    if (table === 'calendar_connections') {
      if (methods.includes('maybeSingle')) {
        return { data: config.connection ?? null, error: config.connectionError ?? null };
      }
      return { data: null, error: null };
    }
    if (table === 'calendar_connection_calendars') {
      if (methods.includes('update')) return { data: null, error: null };
      return { data: config.calendars ?? [], error: null };
    }
    if (table === 'external_calendar_events') {
      if (methods.includes('upsert')) return { data: null, error: config.upsertError ?? null };
      if (methods.includes('delete')) return { data: null, error: config.deleteError ?? null };
      if (methods.includes('update')) return { data: null, error: null };
      // prune candidate select. keyset ページングを 1 バッチで終わらせる。
      const batch = counters.pruneSelect;
      counters.pruneSelect += 1;
      return { data: batch === 0 ? (config.pruneCandidates ?? []) : [], error: null };
    }
    if (table === 'plans') return { data: config.referencedByPlans ?? [], error: null };
    if (table === 'records') return { data: config.referencedByRecords ?? [], error: null };
    return { data: [], error: null };
  }

  const from = vi.fn((table: string) => {
    const recorder: Recorder = { table, chain: [] };
    calls.push(recorder);

    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'then') {
            return (
              onFulfilled: (value: QueryResult) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) => Promise.resolve(resolve(recorder)).then(onFulfilled, onRejected);
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
  return calls.filter((recorder) => recorder.table === table);
}

function findCall(calls: Recorder[], table: string, method: string): Recorder | undefined {
  return recordersFor(calls, table).find((recorder) =>
    recorder.chain.some((entry) => entry.method === method),
  );
}

function argsOf(recorder: Recorder, method: string): unknown[] {
  const entry = recorder.chain.find((item) => item.method === method);
  if (!entry) throw new Error(`method ${method} was not called`);
  return entry.args;
}

function session() {
  return { accessToken: 'access-token', rotatedRefreshToken: null };
}

function syncResult(overrides: Record<string, unknown> = {}) {
  return {
    events: [],
    cancelledEventIds: [],
    skippedEventIds: [],
    nextCursor: 'next-sync-token',
    cursorInvalid: false,
    usedFullSync: false,
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    providerEventId: 'ev-1',
    title: 'Standup',
    description: 'daily',
    startAt: '2026-07-24T09:00:00.000Z',
    endAt: '2026-07-24T09:30:00.000Z',
    ...overrides,
  };
}

function activeConnection() {
  return { id: CONNECTION_ID, user_id: USER_ID, status: 'active', refresh_token_enc: 'enc' };
}

function oneCalendar(syncToken: string | null = 'existing-token') {
  return [{ provider_calendar_id: CALENDAR_ID, calendar_name: 'Work', sync_token: syncToken }];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(RUN_ISO));
  decryptToken.mockReturnValue('refresh-token');
  encryptToken.mockReturnValue('enc');
  startSession.mockResolvedValue(session());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('syncConnection — active イベントの upsert', () => {
  // regression（overview.md §13）: 再同期で dismissed を復活させない
  it('upsert payload に dismissed_at を含めず、全行のキー集合が一致する', async () => {
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: oneCalendar(),
    });
    syncCalendar.mockResolvedValue(
      syncResult({
        events: [
          event({ providerEventId: 'ev-1' }),
          event({ providerEventId: 'ev-2', description: null }),
        ],
      }),
    );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    const upsert = findCall(calls, 'external_calendar_events', 'upsert');
    expect(upsert).toBeDefined();
    const [rows, options] = argsOf(upsert!, 'upsert') as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];

    expect(options.onConflict).toBe(UPSERT_ON_CONFLICT);
    for (const row of rows) {
      expect(Object.prototype.hasOwnProperty.call(row, 'dismissed_at')).toBe(false);
    }
    // 全行のキー集合が同一でないと、PostgREST の和集合 columns で欠けた行の既存値が NULL 化される
    const keySets = rows.map((row) => Object.keys(row).sort().join(','));
    expect(new Set(keySets).size).toBe(1);
    // last_synced_at は run 開始時刻の単一値
    for (const row of rows) expect(row.last_synced_at).toBe(RUN_ISO);
  });

  it('connection_id と user_id を全行に載せる（複合 FK）', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    syncCalendar.mockResolvedValue(syncResult({ events: [event()] }));

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    const upsert = findCall(calls, 'external_calendar_events', 'upsert')!;
    const [rows] = argsOf(upsert, 'upsert') as [Array<Record<string, unknown>>];
    expect(rows[0]).toMatchObject({
      connection_id: CONNECTION_ID,
      user_id: USER_ID,
      provider: 'google',
    });
  });
});

describe('syncConnection — prune anti-join', () => {
  // regression（overview.md §13）: plans / records から参照される行を消さない。
  // soft-delete 済み plan もまだ FK でミラー行を掴んでいるので除外する。
  it('参照済み行（soft-deleted plan 参照を含む）を delete から除外する', async () => {
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: oneCalendar(),
      pruneCandidates: [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }],
      // soft-deleted plan が ev-1 を参照している想定
      referencedByPlans: [{ external_calendar_event_id: 'ev-1' }],
      referencedByRecords: [{ external_calendar_event_id: 'ev-2' }],
    });
    syncCalendar.mockResolvedValue(syncResult());

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    const del = findCall(calls, 'external_calendar_events', 'delete');
    expect(del).toBeDefined();
    const inArgs = argsOf(del!, 'in');
    expect(inArgs[0]).toBe('id');
    expect(inArgs[1]).toEqual(['ev-3']);

    // plans / records の参照クエリは deleted_at で絞らない（soft-deleted も FK を掴む）
    const plansSelect = findCall(calls, 'plans', 'select')!;
    expect(plansSelect.chain.some((entry) => entry.method === 'is')).toBe(false);
  });

  it('全候補が参照されていれば delete を発行しない', async () => {
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: oneCalendar(),
      pruneCandidates: [{ id: 'ev-1' }],
      referencedByPlans: [{ external_calendar_event_id: 'ev-1' }],
    });
    syncCalendar.mockResolvedValue(syncResult());

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(findCall(calls, 'external_calendar_events', 'delete')).toBeUndefined();
  });
});

describe('syncConnection — tombstone', () => {
  it('cancelled / skipped id は UPDATE で cancelled 化し、upsert しない', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    syncCalendar.mockResolvedValue(
      syncResult({ cancelledEventIds: ['c1'], skippedEventIds: ['s1'] }),
    );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    // events が空なので upsert は発行されない（未知 id で行を作らない）
    expect(findCall(calls, 'external_calendar_events', 'upsert')).toBeUndefined();

    const tombstone = recordersFor(calls, 'external_calendar_events').find((recorder) =>
      recorder.chain.some(
        (entry) => entry.method === 'in' && entry.args[0] === 'provider_event_id',
      ),
    );
    expect(tombstone).toBeDefined();
    const inArgs = argsOf(tombstone!, 'in');
    expect(inArgs[1]).toEqual(['c1', 's1']);
    const updateArgs = argsOf(tombstone!, 'update')[0] as Record<string, unknown>;
    expect(updateArgs).toMatchObject({ status: 'cancelled', last_synced_at: RUN_ISO });
  });
});

describe('syncConnection — 410 と sweep', () => {
  it('410 で sync_token を NULL 化し、同 run 内で full sync し直し、sweep する', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar('stale') });
    syncCalendar
      .mockResolvedValueOnce(syncResult({ cursorInvalid: true, usedFullSync: false }))
      .mockResolvedValueOnce(
        syncResult({ events: [event()], usedFullSync: true, nextCursor: 'fresh-token' }),
      );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    // 2 回目は cursor null（full sync）
    expect(syncCalendar).toHaveBeenCalledTimes(2);
    expect(syncCalendar.mock.calls[1]?.[1]).toMatchObject({ cursor: null });

    // sync_token を一度 NULL 化している
    const clearedToken = recordersFor(calls, 'calendar_connection_calendars').some((recorder) =>
      recorder.chain.some(
        (entry) =>
          entry.method === 'update' &&
          (entry.args[0] as Record<string, unknown>).sync_token === null,
      ),
    );
    expect(clearedToken).toBe(true);

    // full sync 完走なので sweep（lt + neq）が走る
    const sweep = recordersFor(calls, 'external_calendar_events').find((recorder) =>
      recorder.chain.some((entry) => entry.method === 'lt'),
    );
    expect(sweep).toBeDefined();
    expect(sweep!.chain.some((entry) => entry.method === 'neq')).toBe(true);
    const sweepLt = argsOf(sweep!, 'lt');
    expect(sweepLt).toEqual(['last_synced_at', RUN_ISO]);
  });

  it('full sync が途中で打ち切られた（nextCursor=null）ら sweep も token 保存もしない', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar(null) });
    syncCalendar.mockResolvedValue(
      syncResult({ events: [event()], usedFullSync: true, nextCursor: null }),
    );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    // upsert は走る
    expect(findCall(calls, 'external_calendar_events', 'upsert')).toBeDefined();
    // sweep は走らない
    const sweep = recordersFor(calls, 'external_calendar_events').find((recorder) =>
      recorder.chain.some((entry) => entry.method === 'lt'),
    );
    expect(sweep).toBeUndefined();
    // sync_token 保存も走らない
    const savedToken = recordersFor(calls, 'calendar_connection_calendars').some((recorder) =>
      recorder.chain.some(
        (entry) =>
          entry.method === 'update' &&
          typeof (entry.args[0] as Record<string, unknown>).sync_token === 'string',
      ),
    );
    expect(savedToken).toBe(false);
  });

  it('全ページ完走時のみ sync_token を保存する', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar('old') });
    syncCalendar.mockResolvedValue(syncResult({ events: [event()], nextCursor: 'brand-new' }));

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    const saved = recordersFor(calls, 'calendar_connection_calendars').find((recorder) =>
      recorder.chain.some(
        (entry) =>
          entry.method === 'update' &&
          (entry.args[0] as Record<string, unknown>).sync_token === 'brand-new',
      ),
    );
    expect(saved).toBeDefined();
  });
});

describe('syncConnection — forceFullSync', () => {
  it('sync_token があっても cursor null で呼ぶ', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar('has-token') });
    syncCalendar.mockResolvedValue(syncResult({ usedFullSync: true, nextCursor: 'tok' }));

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID, forceFullSync: true });

    expect(syncCalendar.mock.calls[0]?.[1]).toMatchObject({ cursor: null });
  });
});

describe('syncConnection — 認可と鍵', () => {
  it('refresh の invalid_grant で status を reauth_required にする', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 400),
    );

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('reauth_required');
    const update = findCall(calls, 'calendar_connections', 'update')!;
    expect(argsOf(update, 'update')[0]).toMatchObject({
      status: 'reauth_required',
      last_sync_error: 'reauth_required',
    });
    // カレンダー同期は始めない
    expect(syncCalendar).not.toHaveBeenCalled();
  });

  it('復号失敗は status を変えず encryption_key_invalid を記録する', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    decryptToken.mockImplementation(() => {
      throw new Error('bad key');
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('encryption_key_invalid');
    const update = findCall(calls, 'calendar_connections', 'update')!;
    const patch = argsOf(update, 'update')[0] as Record<string, unknown>;
    expect(patch.last_sync_error).toBe('encryption_key_invalid');
    // 鍵の設定ミスで全ユーザーを再同意に追い込まない
    expect(patch.status).toBeUndefined();
  });

  it('reauth_required の接続は skip する', async () => {
    setupDb({
      connection: { ...activeConnection(), status: 'reauth_required' },
      calendars: oneCalendar(),
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('skipped_reauth_required');
    expect(startSession).not.toHaveBeenCalled();
  });

  it('接続が存在しなければ not_configured', async () => {
    setupDb({ connection: null });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('not_configured');
  });

  it('connection をロードできない DB 障害は throw する', async () => {
    setupDb({ connectionError: { code: '08006', message: 'connection refused' } });

    await expect(
      syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID }),
    ).rejects.toMatchObject({
      code: 'SYNC_FAILED',
    });
  });
});

describe('syncConnection — token rotation', () => {
  it('rotation された refresh token を再暗号化して保存する', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    syncCalendar.mockResolvedValue(syncResult());

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(encryptToken).toHaveBeenCalledWith('rotated', expect.any(String));
    const saved = recordersFor(calls, 'calendar_connections').find((recorder) =>
      recorder.chain.some(
        (entry) =>
          entry.method === 'update' &&
          'refresh_token_enc' in (entry.args[0] as Record<string, unknown>),
      ),
    );
    expect(saved).toBeDefined();
  });
});

describe('syncConnection — 情報漏洩', () => {
  it('refresh token をログに出さない', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    decryptToken.mockReturnValue('1//super-secret-refresh');
    startSession.mockRejectedValue(new CalendarProviderError('boom', 'transient'));
    syncCalendar.mockResolvedValue(syncResult());

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('super-secret-refresh');
  });
});
