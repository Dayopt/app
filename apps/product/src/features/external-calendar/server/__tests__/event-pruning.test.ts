import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * event-pruning.ts のテスト。
 *
 * overview.md §13 の必須 regression（prune anti-join）はここが正本。sync の window prune /
 * 選択解除 / disconnect の 3 経路が共有する不変条件を凍結する。
 */

const createClient = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn((error: unknown) => error));
const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));

import { deleteUnreferencedEvents } from '../event-pruning';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';

type Recorder = { table: string; chain: Array<{ method: string; args: unknown[] }> };

type Config = {
  candidates?: Array<{ id: string }>;
  referencedByPlans?: Array<{ external_calendar_event_id: string | null }>;
  referencedByRecords?: Array<{ external_calendar_event_id: string | null }>;
  selectError?: unknown;
  deleteError?: unknown;
};

function setupDb(config: Config) {
  const calls: Recorder[] = [];
  let candidateBatch = 0;

  function resolve(recorder: Recorder): { data: unknown; error: unknown } {
    const methods = recorder.chain.map((entry) => entry.method);
    if (recorder.table === 'external_calendar_events') {
      if (methods.includes('delete')) return { data: null, error: config.deleteError ?? null };
      const batch = candidateBatch;
      candidateBatch += 1;
      return {
        data: batch === 0 ? (config.candidates ?? []) : [],
        error: config.selectError ?? null,
      };
    }
    if (recorder.table === 'plans') return { data: config.referencedByPlans ?? [], error: null };
    if (recorder.table === 'records')
      return { data: config.referencedByRecords ?? [], error: null };
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
            return proxy;
          };
        },
      },
    );
    return proxy;
  });

  createClient.mockReturnValue({ from });
  return { calls, from };
}

function candidateSelect(calls: Recorder[]): Recorder | undefined {
  return calls.find(
    (r) => r.table === 'external_calendar_events' && r.chain.some((e) => e.method === 'select'),
  );
}

function deleteCall(calls: Recorder[]): Recorder | undefined {
  return calls.find(
    (r) => r.table === 'external_calendar_events' && r.chain.some((e) => e.method === 'delete'),
  );
}

function argsOf(recorder: Recorder, method: string): unknown[] {
  const entry = recorder.chain.find((e) => e.method === method);
  if (!entry) throw new Error(`${method} not called`);
  return entry.args;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('deleteUnreferencedEvents — anti-join', () => {
  // regression（overview.md §13）: plans / records から参照される行を消さない。
  // soft-delete 済み plan もまだ FK でミラー行を掴んでいるので除外する。
  it('参照済み行（soft-deleted plan 参照を含む）を delete から除外する', async () => {
    const { calls } = setupDb({
      candidates: [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }],
      referencedByPlans: [{ external_calendar_event_id: 'ev-1' }], // soft-deleted plan の参照
      referencedByRecords: [{ external_calendar_event_id: 'ev-2' }],
    });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'connection' },
    });

    const del = deleteCall(calls);
    expect(del).toBeDefined();
    expect(argsOf(del!, 'in')).toEqual(['id', ['ev-3']]);
    // service_role は RLS を bypass するので delete に user_id ガードが載る
    expect(argsOf(del!, 'eq')).toEqual(['user_id', USER_ID]);

    // 参照クエリは deleted_at で絞らない（soft-deleted も FK を掴む）
    const plans = calls.find((r) => r.table === 'plans');
    expect(plans?.chain.some((e) => e.method === 'is')).toBe(false);
  });

  it('候補が空なら delete を発行しない', async () => {
    const { calls } = setupDb({ candidates: [] });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'connection' },
    });

    expect(deleteCall(calls)).toBeUndefined();
  });

  it('全候補が参照済みなら delete を発行しない（空リスト全削除の回避）', async () => {
    const { calls } = setupDb({
      candidates: [{ id: 'ev-1' }],
      referencedByPlans: [{ external_calendar_event_id: 'ev-1' }],
    });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'connection' },
    });

    expect(deleteCall(calls)).toBeUndefined();
  });

  it('select 失敗では throw せず記録して中断する', async () => {
    const { calls } = setupDb({ selectError: { code: '42501' } });

    await expect(
      deleteUnreferencedEvents({
        userId: USER_ID,
        connectionId: CONNECTION_ID,
        scope: { kind: 'connection' },
      }),
    ).resolves.toBeUndefined();

    expect(deleteCall(calls)).toBeUndefined();
    expect(captureUnexpectedDatabaseError).toHaveBeenCalled();
  });
});

describe('deleteUnreferencedEvents — scope 別フィルタ', () => {
  it('window scope は end_at/start_at の or フィルタを付ける', async () => {
    const { calls } = setupDb({ candidates: [{ id: 'ev-1' }] });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: {
        kind: 'window',
        notBefore: '2026-04-25T00:00:00.000Z',
        notAfter: '2026-10-22T00:00:00.000Z',
      },
    });

    const select = candidateSelect(calls)!;
    expect(argsOf(select, 'or')).toEqual([
      'end_at.lt.2026-04-25T00:00:00.000Z,start_at.gt.2026-10-22T00:00:00.000Z',
    ]);
    expect(
      select.chain.some((e) => e.method === 'in' && e.args[0] === 'provider_calendar_id'),
    ).toBe(false);
  });

  it('calendars scope は provider_calendar_id の in フィルタを付ける', async () => {
    const { calls } = setupDb({ candidates: [{ id: 'ev-1' }] });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'calendars', providerCalendarIds: ['cal-a', 'cal-b'] },
    });

    const select = candidateSelect(calls)!;
    const inCall = select.chain.find(
      (e) => e.method === 'in' && e.args[0] === 'provider_calendar_id',
    );
    expect(inCall?.args[1]).toEqual(['cal-a', 'cal-b']);
    expect(select.chain.some((e) => e.method === 'or')).toBe(false);
  });

  it('calendars scope が空なら DB に一切触れない（空 in を撃たない）', async () => {
    const { from } = setupDb({ candidates: [{ id: 'ev-1' }] });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'calendars', providerCalendarIds: [] },
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('connection scope は or も provider_calendar_id in も付けない', async () => {
    const { calls } = setupDb({ candidates: [{ id: 'ev-1' }] });

    await deleteUnreferencedEvents({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      scope: { kind: 'connection' },
    });

    const select = candidateSelect(calls)!;
    expect(select.chain.some((e) => e.method === 'or')).toBe(false);
    expect(
      select.chain.some((e) => e.method === 'in' && e.args[0] === 'provider_calendar_id'),
    ).toBe(false);
    // ただし user_id / connection_id スコープは必ず付く
    const eqCols = select.chain.filter((e) => e.method === 'eq').map((e) => e.args[0]);
    expect(eqCols).toContain('user_id');
    expect(eqCols).toContain('connection_id');
  });
});
