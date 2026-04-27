/**
 * tag-statistics router 回帰テスト
 *
 * createCallerFactory + createMockContext で procedure を直接呼び出し、
 * 統合 API（getTagOverview / getTagTimeline）の RPC 並列呼び出し、
 * 結果集約、snake_case → camelCase 変換、null フォールバックを検証する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

vi.mock('@/lib/sentry/trace', () => ({
  traceDbQuery: <T>(_op: string, fn: () => Promise<T>) => fn(),
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
  it('未認証で getTagOverview は UNAUTHORIZED', async () => {
    const ctx = createMockContext({ userId: undefined });
    const caller = createCaller(ctx);
    await expect(caller.getTagOverview({ tagId: TAG_ID })).rejects.toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });
});

// =============================================================================
// getTagOverview: 7 RPC 並列 + 集約
// =============================================================================

describe('tag-statistics.getTagOverview (proProcedure)', () => {
  function setupOverviewRpc(overrides: Record<string, unknown> = {}) {
    return vi.fn((name: string, _params?: Record<string, unknown>) => {
      const responses: Record<string, unknown> = {
        get_tag_cumulative_time: { data: { totalMinutes: 480 }, error: null },
        get_tag_avg_fulfillment: { data: { avgFulfillment: 2.4, entryCount: 25 }, error: null },
        get_tag_plan_rate: {
          data: { totalEntries: 30, plannedEntries: 25, planRate: 0.83 },
          error: null,
        },
        get_tag_fulfillment_distribution: {
          data: [
            { score: 1, count: 5 },
            { score: 2, count: 10 },
            { score: 3, count: 10 },
          ],
          error: null,
        },
        get_tag_hourly_distribution: {
          data: [
            { hour: 9, total_minutes: 120 },
            { hour: 14, total_minutes: 60 },
          ],
          error: null,
        },
        get_tag_dow_distribution: {
          data: [
            { dow: 1, total_minutes: 240 },
            { dow: 5, total_minutes: 60 },
          ],
          error: null,
        },
        get_child_tag_breakdown: {
          data: [{ tag_id: 'child-1', tag_name: 'Sub', tag_color: 'blue', hours: 4 }],
          error: null,
        },
        ...overrides,
      };
      return Promise.resolve(responses[name] ?? { data: null, error: null });
    });
  }

  it('7 RPC が並列に呼ばれ、結果が集約される', async () => {
    const rpc = setupOverviewRpc();
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagOverview({ tagId: TAG_ID });

    // 7 RPC 呼ばれた
    expect(rpc).toHaveBeenCalledTimes(7);
    expect(result.totalMinutes).toBe(480);
    expect(result.entryCount).toBe(25);
    expect(result.avgFulfillment).toBe(2.4);
    expect(result.totalEntries).toBe(30);
    expect(result.plannedEntries).toBe(25);
    expect(result.planRate).toBe(0.83);
    expect(result.fulfillmentDist).toHaveLength(3);
  });

  it('hourly は 24 要素配列に展開される', async () => {
    const rpc = setupOverviewRpc();
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagOverview({ tagId: TAG_ID });

    expect(result.hourly).toHaveLength(24);
    expect(result.hourly[9]).toEqual({ hour: 9, minutes: 120 });
    expect(result.hourly[14]).toEqual({ hour: 14, minutes: 60 });
    expect(result.hourly[0]).toEqual({ hour: 0, minutes: 0 });
  });

  it('dow は月曜始まりの 7 要素配列に並べ替えられる', async () => {
    const rpc = setupOverviewRpc();
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagOverview({ tagId: TAG_ID });

    expect(result.dow).toHaveLength(7);
    // dow=1（月）が先頭、dow=0（日）が末尾
    expect(result.dow[0]).toEqual({ dow: 1, minutes: 240 });
    expect(result.dow[4]).toEqual({ dow: 5, minutes: 60 });
    expect(result.dow[6]).toEqual({ dow: 0, minutes: 0 });
  });

  it('childTags は snake_case → camelCase に変換される', async () => {
    const rpc = setupOverviewRpc();
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagOverview({ tagId: TAG_ID });

    expect(result.childTags).toEqual([{ tagId: 'child-1', name: 'Sub', color: 'blue', hours: 4 }]);
  });

  it('全 RPC が data=null でも形が保たれる（null フォールバック）', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagOverview({ tagId: TAG_ID });

    expect(result).toEqual({
      totalMinutes: 0,
      entryCount: 0,
      avgFulfillment: null,
      totalEntries: 0,
      plannedEntries: 0,
      planRate: 0,
      fulfillmentDist: [],
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0 })),
      dow: [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, minutes: 0 })),
      childTags: [],
    });
  });

  it('startDate / endDate を全 RPC の引数に含める（buildDateRange）', async () => {
    const rpc = setupOverviewRpc();
    const caller = createCaller(authedCtx(rpc));

    await caller.getTagOverview({
      tagId: TAG_ID,
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-30T23:59:59.000Z',
    });

    // 最初の 6 RPC は p_tag_id を含む
    const firstCall = rpc.mock.calls[0]?.[1];
    expect(firstCall).toMatchObject({
      p_user_id: 'user-1',
      p_tag_id: TAG_ID,
      p_start_date: '2026-04-01T00:00:00.000Z',
      p_end_date: '2026-04-30T23:59:59.000Z',
    });

    // 7 番目（child breakdown）は p_parent_tag_id
    const childCall = rpc.mock.calls[6]?.[1];
    expect(childCall).toMatchObject({
      p_user_id: 'user-1',
      p_parent_tag_id: TAG_ID,
      p_start_date: '2026-04-01T00:00:00.000Z',
      p_end_date: '2026-04-30T23:59:59.000Z',
    });
  });

  it('startDate / endDate なしなら p_start_date / p_end_date を含めない', async () => {
    const rpc = setupOverviewRpc();
    const caller = createCaller(authedCtx(rpc));

    await caller.getTagOverview({ tagId: TAG_ID });

    const firstCall = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(firstCall).not.toHaveProperty('p_start_date');
    expect(firstCall).not.toHaveProperty('p_end_date');
  });
});

// =============================================================================
// getTagTimeline: 2 RPC 並列 + bucket / recentLimit パラメータ
// =============================================================================

describe('tag-statistics.getTagTimeline (proProcedure)', () => {
  it('trend と recentEntries が camelCase に変換される', async () => {
    const rpc = vi.fn((name: string) => {
      if (name === 'get_tag_accuracy_trend') {
        return Promise.resolve({
          data: [{ bucket: '2026-04', avg_deviation: -5.2, entry_count: 10 }],
          error: null,
        });
      }
      if (name === 'get_tag_recent_entries') {
        return Promise.resolve({
          data: [
            {
              entry_id: 'e1',
              title: 'Meeting',
              start_time: '2026-04-27T01:00:00.000Z',
              end_time: '2026-04-27T02:00:00.000Z',
              duration_minutes: 60,
              planned_minutes: 60,
              fulfillment_score: 3,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagTimeline({ tagId: TAG_ID });

    expect(result.trend).toEqual([{ bucket: '2026-04', avgDeviation: -5.2, entryCount: 10 }]);
    expect(result.recentEntries).toEqual([
      {
        entryId: 'e1',
        title: 'Meeting',
        startTime: '2026-04-27T01:00:00.000Z',
        endTime: '2026-04-27T02:00:00.000Z',
        durationMinutes: 60,
        plannedMinutes: 60,
        fulfillmentScore: 3,
      },
    ]);
  });

  it('bucket / recentLimit が指定された時のみ p_bucket / p_limit が送られる', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const caller = createCaller(authedCtx(rpc));

    await caller.getTagTimeline({ tagId: TAG_ID, bucket: 'week', recentLimit: 5 });

    const trendCall = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(trendCall.p_bucket).toBe('week');

    const recentCall = rpc.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(recentCall.p_limit).toBe(5);
  });

  it('bucket / recentLimit なしなら p_bucket / p_limit を含めない', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const caller = createCaller(authedCtx(rpc));

    await caller.getTagTimeline({ tagId: TAG_ID });

    const trendCall = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(trendCall).not.toHaveProperty('p_bucket');

    const recentCall = rpc.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(recentCall).not.toHaveProperty('p_limit');
  });

  it('recentLimit は zod で 1..50 の範囲外を拒否する', async () => {
    const rpc = vi.fn();
    const caller = createCaller(authedCtx(rpc));

    await expect(caller.getTagTimeline({ tagId: TAG_ID, recentLimit: 100 })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 単発 procedure: getTagCumulativeTime のエラーハンドリング
// =============================================================================

describe('tag-statistics.getTagCumulativeTime', () => {
  it('RPC エラーは INTERNAL_SERVER_ERROR に変換される', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const caller = createCaller(authedCtx(rpc));

    await expect(caller.getTagCumulativeTime({ tagId: TAG_ID })).rejects.toThrow(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
    );
  });
});
