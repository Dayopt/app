import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';

const captureUnexpectedError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { listGhostEvents } from '../event-query-service';

const USER_ID = 'user-1';
const RANGE = { startAt: '2026-08-10T00:00:00.000Z', endAt: '2026-08-17T00:00:00.000Z' };

interface MirrorRow {
  id: string;
  user_id: string;
  status: string;
  dismissed_at: string | null;
  connection_id: string | null;
  title: string | null;
  calendar_name: string | null;
  start_at: string | null;
  end_at: string | null;
}

interface ReferenceRow {
  user_id: string;
  external_calendar_event_id: string | null;
  deleted_at: string | null;
}

function mirrorRow(overrides: Partial<MirrorRow> & { id: string }): MirrorRow {
  return {
    user_id: USER_ID,
    status: 'confirmed',
    dismissed_at: null,
    connection_id: 'connection-1',
    title: 'Standup',
    calendar_name: 'Work',
    start_at: '2026-08-11T09:00:00.000Z',
    end_at: '2026-08-11T09:30:00.000Z',
    ...overrides,
  };
}

/**
 * `.in()` / `.is()` / `.gt()` などを実際に適用する最小の fake table。
 *
 * `createChainableMock` は 1 種類の結果しか返せないため、events → plans → records の 3 クエリを
 * 撃つこの service の導出条件（とくに soft-delete の扱いとページング）を検証できない。ここで
 * assert したいのは「どのメソッドを呼んだか」ではなく「どの行が残るか」なので、フィルタを
 * 実際に効かせる。
 */
function createFakeTable<T extends object>(rows: T[]) {
  const valueOf = (row: T, column: string): unknown => (row as Record<string, unknown>)[column];
  const calls: Array<[string, ...unknown[]]> = [];
  let result = [...rows];

  const record = (name: string, ...args: unknown[]) => {
    calls.push([name, ...args]);
  };

  const api = {
    calls,
    select: vi.fn((..._args: unknown[]) => api),
    eq: vi.fn((column: string, value: unknown) => {
      record('eq', column, value);
      result = result.filter((row) => valueOf(row, column) === value);
      return api;
    }),
    is: vi.fn((column: string, value: unknown) => {
      record('is', column, value);
      result = result.filter((row) => valueOf(row, column) === value);
      return api;
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      record('not', column, operator, value);
      result = result.filter((row) => valueOf(row, column) !== value);
      return api;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      record('in', column, values);
      result = result.filter((row) => values.includes(valueOf(row, column)));
      return api;
    }),
    lt: vi.fn((column: string, value: string) => {
      record('lt', column, value);
      result = result.filter((row) => String(valueOf(row, column)) < value);
      return api;
    }),
    gt: vi.fn((column: string, value: string) => {
      record('gt', column, value);
      result = result.filter((row) => String(valueOf(row, column)) > value);
      return api;
    }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => {
      record('order', column, options);
      const direction = options?.ascending === false ? -1 : 1;
      result = [...result].sort(
        (a, b) => String(valueOf(a, column)).localeCompare(String(valueOf(b, column))) * direction,
      );
      return api;
    }),
    limit: vi.fn((count: number) => {
      record('limit', count);
      result = result.slice(0, count);
      return api;
    }),
    then: (resolve: (value: { data: T[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: result, error: null })),
  };

  return api;
}

function createSupabase(options: {
  events: MirrorRow[];
  plans?: ReferenceRow[];
  records?: ReferenceRow[];
}) {
  const eventTables: ReturnType<typeof createFakeTable<MirrorRow>>[] = [];
  const referenceTables: ReturnType<typeof createFakeTable<ReferenceRow>>[] = [];

  const from = vi.fn((table: string) => {
    if (table === 'external_calendar_events') {
      const fake = createFakeTable(options.events);
      eventTables.push(fake);
      return fake;
    }
    const fake = createFakeTable(
      table === 'plans' ? (options.plans ?? []) : (options.records ?? []),
    );
    referenceTables.push(fake);
    return fake;
  });

  return {
    supabase: { from } as unknown as SupabaseClient<Database>,
    from,
    eventTables,
    referenceTables,
  };
}

function reference(eventId: string, deletedAt: string | null = null): ReferenceRow {
  return { user_id: USER_ID, external_calendar_event_id: eventId, deleted_at: deletedAt };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listGhostEvents / 除外条件', () => {
  it('active な行だけを返す', async () => {
    const { supabase } = createSupabase({ events: [mirrorRow({ id: 'a' })] });

    await expect(listGhostEvents(supabase, USER_ID, RANGE)).resolves.toEqual([
      {
        id: 'a',
        title: 'Standup',
        calendarName: 'Work',
        startAt: '2026-08-11T09:00:00.000Z',
        endAt: '2026-08-11T09:30:00.000Z',
      },
    ]);
  });

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['未知の status（allowlist なので落ちる）', { status: 'tentative' }],
    ['dismissed 済み', { dismissed_at: '2026-08-11T00:00:00.000Z' }],
    ['connection が外れた孤児', { connection_id: null }],
    ['他ユーザーの行', { user_id: 'user-2' }],
    ['範囲より後', { start_at: '2026-08-20T09:00:00.000Z', end_at: '2026-08-20T10:00:00.000Z' }],
    ['範囲より前', { start_at: '2026-08-01T09:00:00.000Z', end_at: '2026-08-01T10:00:00.000Z' }],
    ['時刻が欠けている', { start_at: null, end_at: null }],
  ])('%s は返さない', async (_label, overrides) => {
    const { supabase } = createSupabase({
      events: [mirrorRow({ id: 'a', ...overrides })],
    });

    await expect(listGhostEvents(supabase, USER_ID, RANGE)).resolves.toEqual([]);
  });

  it('範囲の端に跨る予定は返す（半開区間）', async () => {
    const { supabase } = createSupabase({
      events: [
        mirrorRow({
          id: 'a',
          start_at: '2026-08-09T23:00:00.000Z',
          end_at: '2026-08-10T01:00:00.000Z',
        }),
      ],
    });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);
    expect(events.map((event) => event.id)).toEqual(['a']);
  });

  it('description を SELECT しない', async () => {
    const { supabase, eventTables } = createSupabase({ events: [mirrorRow({ id: 'a' })] });

    await listGhostEvents(supabase, USER_ID, RANGE);

    const selectArg = eventTables[0]?.select.mock.calls[0]?.[0] as string;
    expect(selectArg).not.toContain('description');
    expect(selectArg).not.toContain('*');
  });
});

describe('listGhostEvents / plans・records の anti-join', () => {
  it('plans が参照済みの行は返さない', async () => {
    const { supabase } = createSupabase({
      events: [mirrorRow({ id: 'a' }), mirrorRow({ id: 'b' })],
      plans: [reference('a')],
    });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);
    expect(events.map((event) => event.id)).toEqual(['b']);
  });

  it('records が参照済みの行は返さない', async () => {
    const { supabase } = createSupabase({
      events: [mirrorRow({ id: 'a' }), mirrorRow({ id: 'b' })],
      records: [reference('b')],
    });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);
    expect(events.map((event) => event.id)).toEqual(['a']);
  });

  it('soft-delete された plan が参照する行は ghost に戻る', async () => {
    const { supabase } = createSupabase({
      events: [mirrorRow({ id: 'a' })],
      plans: [reference('a', '2026-08-11T12:00:00.000Z')],
    });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);
    expect(events.map((event) => event.id)).toEqual(['a']);
  });

  it('参照の読み取りにも user_id を明示する', async () => {
    const { supabase, referenceTables } = createSupabase({
      events: [mirrorRow({ id: 'a' })],
    });

    await listGhostEvents(supabase, USER_ID, RANGE);

    expect(referenceTables).toHaveLength(2);
    for (const table of referenceTables) {
      expect(table.eq).toHaveBeenCalledWith('user_id', USER_ID);
    }
  });
});

describe('listGhostEvents / ページング', () => {
  const BATCH_SIZE = 150;

  function manyRows(count: number, prefix = 'e'): MirrorRow[] {
    return Array.from({ length: count }, (_, index) =>
      mirrorRow({ id: `${prefix}-${String(index).padStart(4, '0')}` }),
    );
  }

  it('1 バッチに満たなければ 1 回で終わる', async () => {
    const { supabase, eventTables } = createSupabase({ events: manyRows(BATCH_SIZE - 1) });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);

    expect(events).toHaveLength(BATCH_SIZE - 1);
    expect(eventTables).toHaveLength(1);
  });

  it('バッチが埋まったら cursor を進めて続きを取る', async () => {
    const rows = manyRows(BATCH_SIZE + 10);
    const { supabase, eventTables } = createSupabase({ events: rows });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);

    expect(events).toHaveLength(BATCH_SIZE + 10);
    expect(eventTables).toHaveLength(2);

    const secondBatchCursor = eventTables[1]?.calls.find(
      ([name, column]) => name === 'gt' && column === 'id',
    );
    expect(secondBatchCursor?.[2]).toBe(rows[BATCH_SIZE - 1]?.id);
  });

  it('id 昇順で order してから limit する（順序無保証の取りこぼしを避ける）', async () => {
    const { supabase, eventTables } = createSupabase({ events: manyRows(3) });

    await listGhostEvents(supabase, USER_ID, RANGE);

    const names = eventTables[0]?.calls.map(([name]) => name) ?? [];
    expect(names.indexOf('order')).toBeLessThan(names.indexOf('limit'));
    expect(eventTables[0]?.order).toHaveBeenCalledWith('id', { ascending: true });
  });

  it('batch 上限に達したら取れた分を返し Sentry へ送る', async () => {
    const MAX_BATCHES = 20;
    const { supabase, eventTables } = createSupabase({
      events: manyRows(BATCH_SIZE * MAX_BATCHES + 1),
    });

    const events = await listGhostEvents(supabase, USER_ID, RANGE);

    expect(eventTables).toHaveLength(MAX_BATCHES);
    expect(events).toHaveLength(BATCH_SIZE * MAX_BATCHES);
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'ghost_query_batch_limit' }),
    );
  });
});

describe('listGhostEvents / エラー', () => {
  it('取得に失敗したら FETCH_FAILED を投げる', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: null, error: { message: 'boom' } })),
      })),
    } as unknown as SupabaseClient<Database>;

    await expect(listGhostEvents(supabase, USER_ID, RANGE)).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    });
  });
});
