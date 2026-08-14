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
const persistCalendarTokenRotation = vi.hoisted(() => vi.fn());
const markCalendarConnectionReauth = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn((error: unknown) => error));
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
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError, captureUnexpectedDatabaseError }));
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/database/external-lifecycle-version', () => ({
  getConfiguredExternalLifecycleAppVersion,
}));
vi.mock('../token-crypto', () => ({ decryptToken }));
vi.mock('../token-rotation', () => ({
  persistCalendarTokenRotation,
  markCalendarConnectionReauth,
}));
vi.mock('../providers/google', () => ({
  googleCalendarAdapter: { provider: 'google', startSession, syncCalendar },
}));

import { PERSIST_RESERVE_MS, syncConnection } from '../sync-service';

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
  calendarsError?: unknown;
  pruneCandidates?: Array<{ id: string }>;
  pruneSelectError?: unknown;
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
      return { data: config.calendars ?? [], error: config.calendarsError ?? null };
    }
    if (table === 'external_calendar_events') {
      if (methods.includes('upsert')) return { data: null, error: config.upsertError ?? null };
      if (methods.includes('delete')) return { data: null, error: config.deleteError ?? null };
      if (methods.includes('update')) return { data: null, error: null };
      // prune candidate select. keyset ページングを 1 バッチで終わらせる。
      const batch = counters.pruneSelect;
      counters.pruneSelect += 1;
      if (batch === 0 && config.pruneSelectError) {
        return { data: null, error: config.pruneSelectError };
      }
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
    deadlineExceeded: false,
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
  return {
    data_generation: 3,
    id: CONNECTION_ID,
    user_id: USER_ID,
    status: 'active',
    refresh_token_enc: 'enc',
  };
}

function oneCalendar(syncToken: string | null = 'existing-token') {
  return [{ provider_calendar_id: CALENDAR_ID, calendar_name: 'Work', sync_token: syncToken }];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(RUN_ISO));
  decryptToken.mockReturnValue('refresh-token');
  persistCalendarTokenRotation.mockResolvedValue({
    outcome: 'updated',
    markReauthIfCurrent: null,
  });
  markCalendarConnectionReauth.mockResolvedValue('marked');
  getConfiguredExternalLifecycleAppVersion.mockResolvedValue(1);
  startSession.mockResolvedValue(session());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('syncConnection — active イベントの upsert', () => {
  it('旧DBでは追加前のconnection列だけを読み同期する', async () => {
    getConfiguredExternalLifecycleAppVersion.mockResolvedValue(0);
    const { calls } = setupDb({
      connection: {
        id: CONNECTION_ID,
        user_id: USER_ID,
        status: 'active',
        refresh_token_enc: 'enc',
      },
      calendars: oneCalendar(),
    });
    syncCalendar.mockResolvedValue(syncResult());

    await expect(syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID })).resolves.toEqual(
      {
        outcome: 'synced',
        calendarsSynced: 1,
        calendarsFailed: 0,
      },
    );

    const connection = findCall(calls, 'calendar_connections', 'maybeSingle');
    if (connection === undefined) throw new Error('connection query not found');
    expect(argsOf(connection, 'select')).toEqual(['id, user_id, status, refresh_token_enc']);
  });

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

describe('syncConnection — prune 委譲', () => {
  // anti-join の詳細な regression は event-pruning.test.ts が正本。ここでは sync が
  // window scope で prune を呼び出す配線だけを確認する（未参照行が消えること）。
  it('window 境界の candidate select を発行し、未参照行を delete する', async () => {
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: oneCalendar(),
      pruneCandidates: [{ id: 'ev-1' }, { id: 'ev-2' }],
      referencedByPlans: [{ external_calendar_event_id: 'ev-1' }],
    });
    syncCalendar.mockResolvedValue(syncResult());

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    // event-pruning の window scope は end_at/start_at の or フィルタで候補を引く
    const candidateSelect = recordersFor(calls, 'external_calendar_events').find((recorder) =>
      recorder.chain.some((entry) => entry.method === 'or'),
    );
    expect(candidateSelect).toBeDefined();

    const del = findCall(calls, 'external_calendar_events', 'delete');
    expect(del).toBeDefined();
    expect(argsOf(del!, 'in')[1]).toEqual(['ev-2']);
  });

  // regression（#1988）: event-pruning.ts は select 失敗を throw するようになった
  // （event-pruning.test.ts 参照）。sync 経路はこれを best-effort として吸収し、window prune
  // の失敗だけで sync 全体を失敗扱いにしない。
  it('window prune が失敗しても sync 自体は synced のまま完了する', async () => {
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: oneCalendar(),
      pruneSelectError: { code: '42501' },
    });
    syncCalendar.mockResolvedValue(syncResult());

    await expect(
      syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID }),
    ).resolves.toMatchObject({ outcome: 'synced' });

    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ operation: 'sync_window_prune' }),
    );
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
  it('refresh の invalid_grant で観測authorityを reauth_required にする', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 400),
    );

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('reauth_required');
    expect(markCalendarConnectionReauth).toHaveBeenCalledWith({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      expectedGeneration: 3,
      expectedRefreshTokenEnc: 'enc',
      lastSyncedAt: RUN_ISO,
    });
    // カレンダー同期は始めない
    expect(syncCalendar).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', 'not_configured'],
    ['superseded', 'partial_failure'],
  ] as const)(
    'invalid_grantのreauth結果が%sなら%sへ写像する',
    async (reauthOutcome, expectedOutcome) => {
      setupDb({ connection: activeConnection(), calendars: oneCalendar() });
      startSession.mockRejectedValue(
        new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 400),
      );
      markCalendarConnectionReauth.mockResolvedValue(reauthOutcome);

      const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

      expect(result.outcome).toBe(expectedOutcome);
      expect(syncCalendar).not.toHaveBeenCalled();
    },
  );

  it('invalid_grantのreauth結果が不明ならthrowしてretryへ委ねる', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 400),
    );
    markCalendarConnectionReauth.mockResolvedValue('unresolved');

    await expect(
      syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'SYNC_FAILED' });
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

  // 空配列に畳むと「0 件を同期して成功」になり、last_synced_at だけが進む（Step 7）
  it('選択カレンダーを読めなかったら成功として記録しない', async () => {
    const { calls } = setupDb({
      connection: activeConnection(),
      calendarsError: { code: '57014', message: 'canceling statement' },
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_failure');
    expect(syncCalendar).not.toHaveBeenCalled();
    expect(captureUnexpectedDatabaseError).toHaveBeenCalled();

    const update = findCall(calls, 'calendar_connections', 'update')!;
    const patch = argsOf(update, 'update')[0] as Record<string, unknown>;
    expect(patch.last_sync_error).toBe('partial_failure');
    // last_synced_at は「最後に試した時刻」。他の失敗経路（鍵不正 / startSession 失敗）と
    // 揃える。進めないと dispatcher の due 判定（last_synced_at < staleBefore）に毎 tick
    // 引っかかり、この接続だけが backoff 無しで回り続ける。
    expect(patch.last_synced_at).toBe(RUN_ISO);
  });

  it('選択カレンダーが 0 件なら成功として記録する', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: [] });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('synced');
    const update = findCall(calls, 'calendar_connections', 'update')!;
    const patch = argsOf(update, 'update')[0] as Record<string, unknown>;
    expect(patch.last_sync_error).toBeNull();
  });
});

describe('syncConnection — 予算切れ（#1965）', () => {
  it('deadlineAt から PERSIST_RESERVE_MS を引いた値を adapter.syncCalendar へ渡す', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    syncCalendar.mockResolvedValue(syncResult());
    const deadlineAt = Date.now() + 30_000;

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID, deadlineAt });

    // 素の deadlineAt をそのまま渡すと、判定直後に取得したページの永続化（upsert /
    // tombstone / token 保存）自体が予算を考慮しない（risk-reviewer 指摘、PR #2075）。
    expect(syncCalendar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deadlineAt: deadlineAt - PERSIST_RESERVE_MS }),
    );
  });

  it('カレンダーが予算切れで打ち切られ、他に完走が無ければ last_synced_at を進めない', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    syncCalendar.mockResolvedValue(syncResult({ deadlineExceeded: true, nextCursor: null }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_timeout');
    expect(result.calendarsSynced).toBe(0);
    expect(result.calendarsFailed).toBe(0);
    // 完全な空振り run（calendarsSynced === 0）。last_synced_at を進めると due 判定
    // （昇順）でこの接続が列の最後尾へ回り、starvation 防止の順序が無効化されるため、
    // 何も書き込まない（risk-reviewer 指摘、PR #2075）。
    expect(findCall(calls, 'calendar_connections', 'update')).toBeUndefined();
  });

  it('部分的に進捗があった予算切れは last_sync_error を書いて last_synced_at を進める', async () => {
    const CALENDAR_B = 'secondary';
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: [
        { provider_calendar_id: CALENDAR_ID, calendar_name: 'Work', sync_token: null },
        { provider_calendar_id: CALENDAR_B, calendar_name: 'Personal', sync_token: null },
      ],
    });
    syncCalendar
      .mockResolvedValueOnce(syncResult({ nextCursor: 'completed-token' }))
      .mockResolvedValueOnce(syncResult({ deadlineExceeded: true, nextCursor: null }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_timeout');
    const update = findCall(calls, 'calendar_connections', 'update')!;
    const patch = argsOf(update, 'update')[0] as Record<string, unknown>;
    // partial_failure（実際の失敗）とは別コードにする。次回 sync で前進する見込みがあり、
    // リトライ導線の文言が異なる。
    expect(patch.last_sync_error).toBe('partial_timeout');
    expect(patch.last_synced_at).toBe(RUN_ISO);
  });

  it('予算切れ前に完走したカレンダーの進捗（sync_token）は保存される', async () => {
    const CALENDAR_B = 'secondary';
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: [
        { provider_calendar_id: CALENDAR_ID, calendar_name: 'Work', sync_token: null },
        { provider_calendar_id: CALENDAR_B, calendar_name: 'Personal', sync_token: null },
      ],
    });
    syncCalendar
      .mockResolvedValueOnce(syncResult({ nextCursor: 'completed-token' }))
      .mockResolvedValueOnce(syncResult({ deadlineExceeded: true, nextCursor: null }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_timeout');
    expect(result.calendarsSynced).toBe(1);
    const tokenUpdates = recordersFor(calls, 'calendar_connection_calendars').filter((recorder) =>
      recorder.chain.some((entry) => entry.method === 'update'),
    );
    // 完走した 1 カレンダー分だけ sync_token が確定する。打ち切られた方は更新されない
    // （cursor を確定しない契約は #1965 でも変わらない）。
    expect(tokenUpdates).toHaveLength(1);
    expect(argsOf(tokenUpdates[0]!, 'update')[0]).toMatchObject({ sync_token: 'completed-token' });
  });

  // 実際の失敗（provider / DB エラー）と予算切れが同一 run で起きた場合、前者を優先報告
  // する（risk-reviewer 指摘、PR #2075）。partial_timeout が先に返ると「選択を確認して」
  // という実失敗側の行動喚起が「もう一度お試しください」に隠れてしまう。
  it('calendarsFailed と calendarsIncomplete が同一 run で両方起きたら partial_failure を優先する', async () => {
    const CALENDAR_B = 'secondary';
    const { calls } = setupDb({
      connection: activeConnection(),
      calendars: [
        { provider_calendar_id: CALENDAR_ID, calendar_name: 'Work', sync_token: null },
        { provider_calendar_id: CALENDAR_B, calendar_name: 'Personal', sync_token: null },
      ],
    });
    syncCalendar
      .mockRejectedValueOnce(new CalendarProviderError('shared removed', 'forbidden'))
      .mockResolvedValueOnce(syncResult({ deadlineExceeded: true, nextCursor: null }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_failure');
    const update = findCall(calls, 'calendar_connections', 'update')!;
    const patch = argsOf(update, 'update')[0] as Record<string, unknown>;
    expect(patch.last_sync_error).toBe('partial_failure');
  });

  // reauth_required と deadline_exceeded が同一 run で両方起きた場合、reauth を優先する
  // （behavior-verifier 指摘、#1965）。データは失われない — 予算切れ側の進捗は
  // syncOneCalendar 内で既に永続化済み（ループ後の分岐より前）で、単に outcome/last_sync_error
  // として表に出るのが 'reauth_required' 側になるだけ。ユーザーはどのみち再接続が要る。
  it('同一 run で reauth_required と deadline_exceeded が両方起きたら reauth_required を優先する', async () => {
    const CALENDAR_B = 'secondary';
    setupDb({
      connection: activeConnection(),
      calendars: [
        { provider_calendar_id: CALENDAR_ID, calendar_name: 'Work', sync_token: null },
        { provider_calendar_id: CALENDAR_B, calendar_name: 'Personal', sync_token: null },
      ],
    });
    syncCalendar
      .mockRejectedValueOnce(
        new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 401),
      )
      .mockResolvedValueOnce(syncResult({ deadlineExceeded: true, nextCursor: null }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('reauth_required');
    expect(markCalendarConnectionReauth).toHaveBeenCalled();
  });
});

describe('syncConnection — 認可の再確認', () => {
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
  it('rotation された refresh token をgeneration-bound RPCで保存する', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    syncCalendar.mockResolvedValue(syncResult());

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(persistCalendarTokenRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        connectionId: CONNECTION_ID,
        expectedGeneration: 3,
        expectedRefreshTokenEnc: 'enc',
        rotatedRefreshToken: 'rotated',
        provider: expect.any(Object),
        lastSyncedAt: RUN_ISO,
      }),
    );
    expect(syncCalendar).toHaveBeenCalled();
  });

  it('rotation更新後の同run 401を同じ新authorityの証明で再認証へ収束する', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    const markRotatedAuthority = vi.fn().mockResolvedValue('marked');
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'updated',
      markReauthIfCurrent: markRotatedAuthority,
    });
    syncCalendar.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 401),
    );

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result).toEqual({
      outcome: 'reauth_required',
      calendarsSynced: 0,
      calendarsFailed: 0,
    });
    expect(markRotatedAuthority).toHaveBeenCalledTimes(1);
    expect(markCalendarConnectionReauth).not.toHaveBeenCalled();
  });

  it('purgeが先行してtokenをoutboxへ退避したら後続同期を止める', async () => {
    const { calls } = setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'enqueued',
      markReauthIfCurrent: null,
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result).toEqual({
      outcome: 'not_configured',
      calendarsSynced: 0,
      calendarsFailed: 0,
    });
    expect(syncCalendar).not.toHaveBeenCalled();
    expect(recordersFor(calls, 'calendar_connection_calendars')).toHaveLength(0);
    expect(recordersFor(calls, 'external_calendar_events')).toHaveLength(0);
    const statusWrite = recordersFor(calls, 'calendar_connections').find((recorder) =>
      recorder.chain.some((entry) => entry.method === 'update'),
    );
    expect(statusWrite).toBeUndefined();
  });

  it.each([
    ['reauth_required', 'reauth_required'],
    ['missing', 'not_configured'],
    ['superseded', 'partial_failure'],
  ] as const)(
    'token rotation結果が%sなら%sで後続同期を止める',
    async (outcome, expectedOutcome) => {
      setupDb({
        connection: activeConnection(),
        calendars: oneCalendar(),
      });
      startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
      persistCalendarTokenRotation.mockResolvedValue({
        outcome,
        markReauthIfCurrent: null,
      });

      const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

      expect(result.outcome).toBe(expectedOutcome);
      expect(syncCalendar).not.toHaveBeenCalled();
    },
  );

  it('token rotation結果を確定できなければ後続同期を止めてthrowする', async () => {
    setupDb({ connection: activeConnection(), calendars: oneCalendar() });
    startSession.mockResolvedValue({ accessToken: 'a', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'unresolved',
      markReauthIfCurrent: null,
    });

    await expect(
      syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'SYNC_FAILED' });
    expect(syncCalendar).not.toHaveBeenCalled();
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
