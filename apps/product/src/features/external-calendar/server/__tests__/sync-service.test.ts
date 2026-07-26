import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarProviderError } from '../providers/types';

const startSession = vi.hoisted(() => vi.fn());
const syncCalendar = vi.hoisted(() => vi.fn());
const decryptToken = vi.hoisted(() => vi.fn());
const persistCalendarTokenRotation = vi.hoisted(() => vi.fn());
const markCalendarConnectionReauth = vi.hoisted(() => vi.fn());
const resolveGoogleCalendarProjectKey = vi.hoisted(() => vi.fn());
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
vi.mock('../authority-config', () => ({ resolveGoogleCalendarProjectKey }));
vi.mock('../token-crypto', () => ({ decryptToken }));
vi.mock('../token-rotation', () => ({
  persistCalendarTokenRotation,
  markCalendarConnectionReauth,
}));
vi.mock('../providers/google', () => ({
  googleCalendarAdapter: { provider: 'google', startSession, syncCalendar },
}));

import { syncConnection } from '../sync-service';

const PROJECT_KEY = '123456789012';
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';
const AUTHORITY_FENCE_ID = '00000000-0000-4000-8000-0000000000f1';
const SELECTION_ID = '00000000-0000-4000-8000-0000000000d1';
const CALENDAR_ID = 'primary';
const DB_RUN_ISO = '2026-07-24T00:00:00.000Z';

type RpcName =
  | 'begin_calendar_sync_run_v1'
  | 'clear_calendar_sync_cursor_command_v1'
  | 'finish_calendar_sync_run_v1'
  | 'persist_calendar_sync_result_command_v1';

type RpcResult = { data: unknown; error: unknown };
type RpcResponse = RpcResult | Error;

type QueryRecorder = {
  table: string;
  chain: Array<{ method: string; args: unknown[] }>;
};

type DbConfig = {
  calendars?: Array<Record<string, unknown>>;
  calendarError?: unknown;
  rpcResults?: Partial<Record<RpcName, RpcResponse[]>>;
};

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    result: 'started',
    data_generation: 3,
    authority_fence_id: AUTHORITY_FENCE_ID,
    authority_epoch: 2,
    sync_sequence: 7,
    run_started_at: DB_RUN_ISO,
    refresh_token_enc: 'encrypted-refresh-token',
    ...overrides,
  };
}

function oneCalendar(syncToken: string | null = 'existing-token') {
  return [
    {
      id: SELECTION_ID,
      provider_calendar_id: CALENDAR_ID,
      sync_token: syncToken,
    },
  ];
}

function defaultRpcResult(name: RpcName): RpcResult {
  if (name === 'begin_calendar_sync_run_v1') return { data: [runRow()], error: null };
  if (name === 'clear_calendar_sync_cursor_command_v1') {
    return { data: 'cleared', error: null };
  }
  if (name === 'persist_calendar_sync_result_command_v1') {
    return { data: 'persisted', error: null };
  }
  return { data: 'finished', error: null };
}

function setupDb(config: DbConfig = {}) {
  const queryCalls: QueryRecorder[] = [];
  const counters = new Map<RpcName, number>();

  const rpc = vi.fn((name: RpcName, _args: unknown) => {
    const responses = config.rpcResults?.[name] ?? [defaultRpcResult(name)];
    const index = counters.get(name) ?? 0;
    counters.set(name, index + 1);
    const response = responses[Math.min(index, responses.length - 1)]!;
    return {
      abortSignal: vi.fn(() =>
        response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
      ),
    };
  });

  const from = vi.fn((table: string) => {
    const recorder: QueryRecorder = { table, chain: [] };
    queryCalls.push(recorder);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, property: string) {
          if (property === 'then') {
            return (
              onFulfilled: (value: RpcResult) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) =>
              Promise.resolve({
                data: config.calendars ?? oneCalendar(),
                error: config.calendarError ?? null,
              }).then(onFulfilled, onRejected);
          }
          return (...args: unknown[]) => {
            recorder.chain.push({ method: property, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  });

  createClient.mockReturnValue({ from, rpc });
  return { from, queryCalls, rpc };
}

function rpcCalls(rpc: ReturnType<typeof setupDb>['rpc'], name: RpcName) {
  return rpc.mock.calls.filter(([calledName]) => calledName === name);
}

function session() {
  return { accessToken: 'access-token', rotatedRefreshToken: null };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    providerEventId: 'event-1',
    title: 'Standup',
    description: 'daily',
    startAt: '2026-07-24T09:00:00.000Z',
    endAt: '2026-07-24T09:30:00.000Z',
    ...overrides,
  };
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

function expectedFenceArgs(syncSequence = 7) {
  return {
    p_project_key: PROJECT_KEY,
    p_user_id: USER_ID,
    p_connection_id: CONNECTION_ID,
    p_expected_generation: 3,
    p_expected_authority_fence_id: AUTHORITY_FENCE_ID,
    p_expected_authority_epoch: 2,
    p_expected_sync_sequence: syncSequence,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
  resolveGoogleCalendarProjectKey.mockReturnValue(PROJECT_KEY);
  decryptToken.mockReturnValue('plain-refresh-token');
  startSession.mockResolvedValue(session());
  syncCalendar.mockResolvedValue(syncResult());
  persistCalendarTokenRotation.mockResolvedValue({
    outcome: 'updated',
    markReauthIfCurrent: null,
  });
  markCalendarConnectionReauth.mockResolvedValue('marked');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('syncConnection — DB-issued run identity', () => {
  it('beginのidentityとDB時刻だけをprovider・persist・finishへ渡す', async () => {
    const { rpc } = setupDb();
    syncCalendar.mockResolvedValue(
      syncResult({
        events: [event()],
        cancelledEventIds: ['cancelled-1'],
      }),
    );

    await expect(syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID })).resolves.toEqual(
      {
        outcome: 'synced',
        calendarsSynced: 1,
        calendarsFailed: 0,
      },
    );

    expect(rpc).toHaveBeenCalledWith('begin_calendar_sync_run_v1', {
      p_project_key: PROJECT_KEY,
      p_user_id: USER_ID,
      p_connection_id: CONNECTION_ID,
    });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(decryptToken.mock.invocationCallOrder[0]!);
    expect(decryptToken).toHaveBeenCalledWith('encrypted-refresh-token', expect.any(String));
    expect(syncCalendar).toHaveBeenCalledWith(
      session(),
      expect.objectContaining({
        calendarId: CALENDAR_ID,
        cursor: 'existing-token',
        window: {
          timeMin: '2026-04-25T00:00:00.000Z',
          timeMax: '2026-10-22T00:00:00.000Z',
        },
      }),
    );
    expect(rpc).toHaveBeenCalledWith('persist_calendar_sync_result_command_v1', {
      ...expectedFenceArgs(),
      p_calendar_selection_id: SELECTION_ID,
      p_provider_calendar_id: CALENDAR_ID,
      p_run_started_at: DB_RUN_ISO,
      p_events: [event()],
      p_tombstone_event_ids: ['cancelled-1'],
      p_used_full_sync: false,
      p_next_cursor: 'next-sync-token',
    });
    expect(rpc).toHaveBeenCalledWith('finish_calendar_sync_run_v1', {
      ...expectedFenceArgs(),
      p_run_started_at: DB_RUN_ISO,
      p_last_sync_error: null,
      p_prune_window: true,
      p_not_before: '2026-04-25T00:00:00.000Z',
      p_not_after: '2026-10-22T00:00:00.000Z',
    });
  });

  it('table accessはselection readだけでdirect mutationを発行しない', async () => {
    const { from, queryCalls } = setupDb();

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('calendar_connection_calendars');
    expect(queryCalls[0]?.chain.map(({ method }) => method)).toEqual(['select', 'eq', 'eq']);
    expect(
      queryCalls.some((call) =>
        call.chain.some(({ method }) => ['delete', 'insert', 'update', 'upsert'].includes(method)),
      ),
    ).toBe(false);
  });

  it.each([
    ['missing', 'not_configured'],
    ['reauth_required', 'skipped_reauth_required'],
    ['superseded', 'superseded'],
  ] as const)('begin結果%sではproviderを呼ばず%sへ写像する', async (result, expected) => {
    setupDb({
      rpcResults: {
        begin_calendar_sync_run_v1: [{ data: [runRow({ result })], error: null }],
      },
    });

    const actual = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(actual.outcome).toBe(expected);
    expect(decryptToken).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('begin response欠落後は返却できた最新sequenceだけでproviderを一度実行する', async () => {
    const { rpc } = setupDb({
      rpcResults: {
        begin_calendar_sync_run_v1: [
          new Error('response lost'),
          { data: [runRow({ sync_sequence: 8 })], error: null },
        ],
      },
    });

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(rpcCalls(rpc, 'begin_calendar_sync_run_v1')).toHaveLength(2);
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(syncCalendar).toHaveBeenCalledTimes(1);
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')[0]?.[1]).toMatchObject({
      p_expected_sync_sequence: 8,
    });
  });
});

describe('syncConnection — failure publication', () => {
  it('復号失敗はproviderを呼ばずfenced finishへ安定コードを保存する', async () => {
    const { rpc } = setupDb();
    decryptToken.mockImplementation(() => {
      throw new Error('secret key detail');
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('encryption_key_invalid');
    expect(startSession).not.toHaveBeenCalled();
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('finish_calendar_sync_run_v1', {
      ...expectedFenceArgs(),
      p_run_started_at: DB_RUN_ISO,
      p_last_sync_error: 'encryption_key_invalid',
      p_prune_window: false,
      p_not_before: null,
      p_not_after: null,
    });
    expect(JSON.stringify(captureUnexpectedError.mock.calls)).not.toContain('secret key detail');
  });

  it('session開始のinvalid_grantは観測したrun authorityだけをreauthへ進める', async () => {
    setupDb();
    startSession.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 400),
    );

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('reauth_required');
    expect(markCalendarConnectionReauth).toHaveBeenCalledWith({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      expectedAuthorityFenceId: AUTHORITY_FENCE_ID,
      expectedAuthorityEpoch: 2,
      expectedGeneration: 3,
      expectedRefreshTokenEnc: 'encrypted-refresh-token',
      lastSyncedAt: DB_RUN_ISO,
    });
    expect(syncCalendar).not.toHaveBeenCalled();
  });

  it('provider開始失敗はwindow pruneをせず安定コードだけをfinishする', async () => {
    const { rpc } = setupDb();
    startSession.mockRejectedValue(new CalendarProviderError('quota', 'rate_limited'));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_failure');
    expect(rpcCalls(rpc, 'finish_calendar_sync_run_v1')[0]?.[1]).toMatchObject({
      p_last_sync_error: 'rate_limited',
      p_prune_window: false,
      p_not_before: null,
      p_not_after: null,
    });
  });

  it('個別calendar失敗はpartial_failureをpublishし他calendarを継続する', async () => {
    const secondSelectionId = '00000000-0000-4000-8000-0000000000d2';
    const { rpc } = setupDb({
      calendars: [
        ...oneCalendar(),
        { id: secondSelectionId, provider_calendar_id: 'secondary', sync_token: null },
      ],
    });
    syncCalendar
      .mockRejectedValueOnce(new CalendarProviderError('temporary', 'transient'))
      .mockResolvedValueOnce(syncResult());

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result).toEqual({
      outcome: 'partial_failure',
      calendarsSynced: 1,
      calendarsFailed: 1,
    });
    expect(syncCalendar).toHaveBeenCalledTimes(2);
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')).toHaveLength(1);
    expect(rpcCalls(rpc, 'finish_calendar_sync_run_v1')[0]?.[1]).toMatchObject({
      p_last_sync_error: 'partial_failure',
      p_prune_window: true,
    });
  });
});

describe('syncConnection — cursorとstale writer', () => {
  it('410ではexact cursorをclearできた場合だけ同じrunでfull retryする', async () => {
    const { rpc } = setupDb();
    syncCalendar
      .mockResolvedValueOnce(syncResult({ cursorInvalid: true }))
      .mockResolvedValueOnce(
        syncResult({ events: [event()], usedFullSync: true, nextCursor: 'fresh-token' }),
      );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(rpc).toHaveBeenCalledWith('clear_calendar_sync_cursor_command_v1', {
      ...expectedFenceArgs(),
      p_calendar_selection_id: SELECTION_ID,
      p_provider_calendar_id: CALENDAR_ID,
      p_expected_sync_token: 'existing-token',
    });
    expect(syncCalendar).toHaveBeenCalledTimes(2);
    expect(syncCalendar.mock.calls[1]?.[1]).toMatchObject({ cursor: null });
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')[0]?.[1]).toMatchObject({
      p_used_full_sync: true,
      p_next_cursor: 'fresh-token',
    });
  });

  it('cursor clearがresponse欠落後supersededならproviderを再実行しない', async () => {
    const { rpc } = setupDb({
      rpcResults: {
        clear_calendar_sync_cursor_command_v1: [
          new Error('response lost'),
          { data: 'superseded', error: null },
        ],
      },
    });
    syncCalendar.mockResolvedValue(syncResult({ cursorInvalid: true }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('superseded');
    expect(rpcCalls(rpc, 'clear_calendar_sync_cursor_command_v1')).toHaveLength(2);
    expect(syncCalendar).toHaveBeenCalledTimes(1);
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')).toHaveLength(0);
    expect(rpcCalls(rpc, 'finish_calendar_sync_run_v1')).toHaveLength(0);
  });

  it('full retryでもcursor invalidなら空結果をpublishせずpartial failureにする', async () => {
    const { rpc } = setupDb();
    syncCalendar.mockResolvedValue(syncResult({ cursorInvalid: true }));

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_failure');
    expect(syncCalendar).toHaveBeenCalledTimes(2);
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')).toHaveLength(0);
    expect(rpcCalls(rpc, 'finish_calendar_sync_run_v1')[0]?.[1]).toMatchObject({
      p_last_sync_error: 'partial_failure',
    });
  });

  it('persistがsupersededならstatusをpublishせず停止する', async () => {
    const { rpc } = setupDb({
      rpcResults: {
        persist_calendar_sync_result_command_v1: [{ data: 'superseded', error: null }],
      },
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('superseded');
    expect(rpcCalls(rpc, 'finish_calendar_sync_run_v1')).toHaveLength(0);
  });

  it('persist response欠落後はproviderを再実行せず同じresultだけを再送する', async () => {
    const { rpc } = setupDb({
      rpcResults: {
        persist_calendar_sync_result_command_v1: [
          new Error('response lost after commit'),
          { data: 'persisted', error: null },
        ],
      },
    });

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(syncCalendar).toHaveBeenCalledTimes(1);
    const persistCalls = rpcCalls(rpc, 'persist_calendar_sync_result_command_v1');
    expect(persistCalls).toHaveLength(2);
    expect(persistCalls[0]).toEqual(persistCalls[1]);
  });

  it('finish response欠落後は同じcompletionだけを再送する', async () => {
    const { rpc } = setupDb({
      rpcResults: {
        finish_calendar_sync_run_v1: [
          new Error('response lost after commit'),
          { data: 'finished', error: null },
        ],
      },
    });

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    const finishCalls = rpcCalls(rpc, 'finish_calendar_sync_run_v1');
    expect(finishCalls).toHaveLength(2);
    expect(finishCalls[0]).toEqual(finishCalls[1]);
    expect(syncCalendar).toHaveBeenCalledTimes(1);
  });
});

describe('syncConnection — payload disciplineとrotation', () => {
  it('active eventを優先しtombstoneをdedupeして単一RPCへ渡す', async () => {
    const { rpc } = setupDb();
    syncCalendar.mockResolvedValue(
      syncResult({
        events: [event(), event({ title: 'latest' })],
        cancelledEventIds: ['event-1', 'cancelled-1', 'cancelled-1'],
        skippedEventIds: ['skipped-1'],
      }),
    );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')[0]?.[1]).toMatchObject({
      p_events: [event({ title: 'latest' })],
      p_tombstone_event_ids: ['cancelled-1', 'skipped-1'],
    });
  });

  it('atomic上限を超えるresultはdirect writeへfallbackせずpartial failureにする', async () => {
    const { rpc } = setupDb();
    syncCalendar.mockResolvedValue(
      syncResult({
        events: Array.from({ length: 10_001 }, (_, index) =>
          event({ providerEventId: `event-${index}` }),
        ),
      }),
    );

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('partial_failure');
    expect(rpcCalls(rpc, 'persist_calendar_sync_result_command_v1')).toHaveLength(0);
    expect(rpcCalls(rpc, 'finish_calendar_sync_run_v1')[0]?.[1]).toMatchObject({
      p_last_sync_error: 'partial_failure',
    });
  });

  it('rotated tokenを同じrun authorityへ束縛し、supersededならprovider readを止める', async () => {
    setupDb();
    startSession.mockResolvedValue({ accessToken: 'access', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'superseded',
      markReauthIfCurrent: null,
    });

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('superseded');
    expect(persistCalendarTokenRotation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        connectionId: CONNECTION_ID,
        expectedAuthorityFenceId: AUTHORITY_FENCE_ID,
        expectedAuthorityEpoch: 2,
        expectedGeneration: 3,
        expectedRefreshTokenEnc: 'encrypted-refresh-token',
        rotatedRefreshToken: 'rotated',
        lastSyncedAt: DB_RUN_ISO,
      }),
    );
    expect(syncCalendar).not.toHaveBeenCalled();
  });

  it('rotation後のcalendar 401は新authority closureだけをreauthへ進める', async () => {
    setupDb();
    const markRotatedAuthority = vi.fn().mockResolvedValue('marked');
    startSession.mockResolvedValue({ accessToken: 'access', rotatedRefreshToken: 'rotated' });
    persistCalendarTokenRotation.mockResolvedValue({
      outcome: 'updated',
      markReauthIfCurrent: markRotatedAuthority,
    });
    syncCalendar.mockRejectedValue(
      new CalendarProviderError('revoked', 'reauth_required', 'invalid_grant', 401),
    );

    const result = await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    expect(result.outcome).toBe('reauth_required');
    expect(markRotatedAuthority).toHaveBeenCalledTimes(1);
    expect(markCalendarConnectionReauth).not.toHaveBeenCalled();
  });

  it('refresh tokenやprovider error detailをログへ出さない', async () => {
    setupDb();
    decryptToken.mockReturnValue('1//super-secret-refresh');
    startSession.mockRejectedValue(
      new CalendarProviderError('provider-secret-detail', 'transient'),
    );

    await syncConnection({ connectionId: CONNECTION_ID, userId: USER_ID });

    const logged = JSON.stringify([
      loggerWarn.mock.calls,
      captureUnexpectedError.mock.calls,
      captureUnexpectedDatabaseError.mock.calls,
    ]);
    expect(logged).not.toContain('super-secret-refresh');
    expect(logged).not.toContain('provider-secret-detail');
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'calendar provider operation failed' }),
      expect.objectContaining({ operation: 'start_session' }),
    );
  });
});
