/**
 * tag-statistics router 回帰テスト
 *
 * createCallerFactory + createMockContext で procedure を直接呼び出し、
 * getTagDashboard の table query + 集約、認証ガードを検証する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

vi.mock('@/lib/sentry/trace', () => ({
  traceDbQuery: <T>(_op: string, fn: () => Promise<T>) => fn(),
}));

vi.mock('@/lib/server/user-timezone-cache', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

import { entriesTagStatisticsRouter } from '../tag-statistics';

const createCaller = createCallerFactory(entriesTagStatisticsRouter);

function authedCtx(rpcImpl: ReturnType<typeof vi.fn>) {
  const ctx = createMockContext({ userId: 'user-1' });
  ctx.supabase.rpc = rpcImpl as never;
  return Object.assign(ctx, { subscriptionStatus: 'active' });
}

const TAG_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 認証 / Pro guard
// =============================================================================

describe('tag-statistics router: 認証ガード', () => {
  it('未認証で getTagDashboard は UNAUTHORIZED', async () => {
    const ctx = createMockContext({ userId: undefined });
    const caller = createCaller(ctx);
    await expect(
      caller.getTagDashboard({
        tagId: TAG_ID,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T23:59:59.000Z',
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });
});

// =============================================================================
// getTagDashboard: direct table query + aggregation
// =============================================================================

describe('tag-statistics.getTagDashboard (protectedProcedure)', () => {
  function createQuery(result: unknown, singleResult?: unknown) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(singleResult ?? result),
      then: vi.fn().mockImplementation((resolve) => resolve(result)),
    };
    return query;
  }

  it('タグと期間内エントリを取得し、KPI / 日別 / entries を返す', async () => {
    const tagQuery = createQuery(
      { data: null, error: null },
      {
        data: { id: TAG_ID, name: 'Work', color: 'blue', icon: 'briefcase' },
        error: null,
      },
    );
    const entriesQuery = createQuery({
      data: [
        {
          id: 'entry-1',
          title: 'Plan only',
          description: null,
          start_time: '2026-05-01T00:00:00.000Z',
          end_time: '2026-05-01T01:00:00.000Z',
          actual_start_time: '2026-05-01T00:00:00.000Z',
          actual_end_time: '2026-05-01T01:00:00.000Z',
          tag_id: TAG_ID,
        },
        {
          id: 'entry-2',
          title: 'Actual',
          description: 'memo',
          start_time: '2026-05-01T02:00:00.000Z',
          end_time: '2026-05-01T03:00:00.000Z',
          actual_start_time: '2026-05-01T02:00:00.000Z',
          actual_end_time: '2026-05-01T03:30:00.000Z',
          tag_id: TAG_ID,
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => (table === 'tags' ? tagQuery : entriesQuery));
    const ctx = authedCtx(vi.fn());
    ctx.supabase.from = from as never;
    const caller = createCaller(ctx);

    const result = await caller.getTagDashboard({
      tagId: TAG_ID,
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-07T23:59:59.999Z',
      limit: 1,
    });

    expect(from).toHaveBeenCalledWith('tags');
    expect(from).toHaveBeenCalledWith('entries');
    expect(entriesQuery.or).toHaveBeenCalledWith(
      [
        'and(start_time.lt.2026-05-07T23:59:59.999Z,end_time.gt.2026-05-01T00:00:00.000Z)',
        'and(actual_start_time.lt.2026-05-07T23:59:59.999Z,actual_end_time.gt.2026-05-01T00:00:00.000Z)',
      ].join(','),
    );
    expect(result.summary).toMatchObject({
      plannedMinutes: 120,
      actualMinutes: 150,
      diffMinutes: 30,
      entryCount: 2,
    });
    expect(result.dailyRows).toEqual([
      { date: '2026-05-01', plannedMinutes: 120, actualMinutes: 150, diffMinutes: 30 },
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.entryId).toBe('entry-2');
  });

  it('Pro未契約でも認証済みなら取得できる', async () => {
    const tagQuery = createQuery(
      { data: null, error: null },
      {
        data: { id: TAG_ID, name: 'Work', color: 'blue', icon: 'briefcase' },
        error: null,
      },
    );
    const entriesQuery = createQuery({ data: [], error: null });
    const ctx = createMockContext({ userId: 'user-1' });
    ctx.supabase.from = vi.fn((table: string) =>
      table === 'tags' ? tagQuery : entriesQuery,
    ) as never;
    const caller = createCaller(ctx);

    await expect(
      caller.getTagDashboard({
        tagId: TAG_ID,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-07T23:59:59.999Z',
        limit: 50,
      }),
    ).resolves.toMatchObject({
      tag: { id: TAG_ID, name: 'Work' },
      summary: { entryCount: 0 },
    });
  });
});
