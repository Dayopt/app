/**
 * statistics router 回帰テスト
 *
 * createCallerFactory + createMockContext で procedure を直接呼び出し、
 * RPC 呼び出しの引数組み立て、結果の transformation、エラー時の TRPCError
 * 変換を検証する。DB RPC 関数自体の集計ロジックは scope 外。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

// Sentry の trace は test 中ノイズになるので noop に
vi.mock('@/lib/sentry/trace', () => ({
  traceDbQuery: <T>(_op: string, fn: () => Promise<T>) => fn(),
}));

import { entriesStatisticsRouter } from '../statistics';

const createCaller = createCallerFactory(entriesStatisticsRouter);

function authedCtx(rpcImpl: ReturnType<typeof vi.fn>) {
  const ctx = createMockContext({ userId: 'user-1' });
  ctx.supabase.rpc = rpcImpl as never;
  // proProcedure 用に subscriptionStatus を設定（DB フォールバック回避）
  return Object.assign(ctx, { subscriptionStatus: 'active' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 認証ガード
// =============================================================================

describe('statistics router: 認証ガード', () => {
  it('未認証で getTagStats は UNAUTHORIZED', async () => {
    const ctx = createMockContext({ userId: undefined });
    const caller = createCaller(ctx);
    await expect(caller.getTagStats()).rejects.toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });
});

// =============================================================================
// getTagStats: counts / lastUsed への transformation
// =============================================================================

describe('statistics.getTagStats', () => {
  it('RPC 結果を { counts, lastUsed } に変換する', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [
        { tag_id: 'tag-1', entry_count: 5, last_used: '2026-04-20' },
        { tag_id: 'tag-2', entry_count: 2, last_used: null },
      ],
      error: null,
    });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagStats();

    expect(rpc).toHaveBeenCalledWith('get_tag_stats', { p_user_id: 'user-1' });
    expect(result).toEqual({
      counts: { 'tag-1': 5, 'tag-2': 2 },
      lastUsed: { 'tag-1': '2026-04-20' },
    });
  });

  it('data=null でも空のオブジェクトを返す', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTagStats();
    expect(result).toEqual({ counts: {}, lastUsed: {} });
  });

  it('RPC エラーは INTERNAL_SERVER_ERROR に変換される', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const caller = createCaller(authedCtx(rpc));

    await expect(caller.getTagStats()).rejects.toThrow(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
    );
  });
});

// =============================================================================
// getTimeByTag: row mapping + 期間 filter
// =============================================================================

describe('statistics.getTimeByTag', () => {
  it('snake_case row を camelCase に変換する', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ tag_id: 'tag-1', tag_name: 'Deep Work', tag_color: 'blue', hours: 12.5 }],
      error: null,
    });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getTimeByTag();

    expect(result).toEqual([{ tagId: 'tag-1', name: 'Deep Work', color: 'blue', hours: 12.5 }]);
  });

  it('startDate / endDate を p_start_date / p_end_date として送る（stripUndefined 適用）', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const caller = createCaller(authedCtx(rpc));

    await caller.getTimeByTag({
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-30T23:59:59.000Z',
    });

    expect(rpc).toHaveBeenCalledWith('get_time_by_tag', {
      p_user_id: 'user-1',
      p_start_date: '2026-04-01T00:00:00.000Z',
      p_end_date: '2026-04-30T23:59:59.000Z',
    });
  });

  it('input なしなら p_user_id のみで呼ぶ（undefined params が落ちる）', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const caller = createCaller(authedCtx(rpc));

    await caller.getTimeByTag();

    expect(rpc).toHaveBeenCalledWith('get_time_by_tag', { p_user_id: 'user-1' });
  });
});

// =============================================================================
// getDailyHours: input 検証 + pass-through
// =============================================================================

describe('statistics.getDailyHours', () => {
  it('year を p_year として送り、結果をそのまま返す', async () => {
    const rows = [{ date: '2026-04-27', hours: 8 }];
    const rpc = vi.fn().mockResolvedValueOnce({ data: rows, error: null });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getDailyHours({ year: 2026 });

    expect(rpc).toHaveBeenCalledWith('get_daily_hours', {
      p_user_id: 'user-1',
      p_year: 2026,
    });
    expect(result).toEqual(rows);
  });

  it('year が範囲外なら zod バリデーション失敗', async () => {
    const rpc = vi.fn();
    const caller = createCaller(authedCtx(rpc));

    await expect(caller.getDailyHours({ year: 1999 })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

// =============================================================================
// getHourlyDistribution: 24 時間 → 12 個の 2h スロット集約
// =============================================================================

describe('statistics.getHourlyDistribution (proProcedure)', () => {
  it('24 時間データを 12 個の 2h スロットに集約する（minutes → hours 変換）', async () => {
    const rows = [
      { hour: 0, total_minutes: 60 }, // 1h
      { hour: 1, total_minutes: 30 }, // 0.5h
      { hour: 9, total_minutes: 120 }, // 2h
      { hour: 23, total_minutes: 60 }, // 1h
    ];
    const rpc = vi.fn().mockResolvedValueOnce({ data: rows, error: null });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getHourlyDistribution();

    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ timeSlot: '00:00', hours: 1.5 }); // 1+0.5
    expect(result[4]).toEqual({ timeSlot: '08:00', hours: 2 }); // 9時のみ
    expect(result[11]).toEqual({ timeSlot: '22:00', hours: 1 }); // 23時のみ
  });

  it('範囲外 hour（>=24, <0）は無視される', async () => {
    const rows = [
      { hour: -1, total_minutes: 60 },
      { hour: 24, total_minutes: 60 },
      { hour: 12, total_minutes: 60 },
    ];
    const rpc = vi.fn().mockResolvedValueOnce({ data: rows, error: null });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getHourlyDistribution();
    // 12 時のみ反映（slot 6 = "12:00"）
    expect(result[6]).toEqual({ timeSlot: '12:00', hours: 1 });
    // 他の slot は 0
    expect(result[0]?.hours).toBe(0);
  });
});

// =============================================================================
// getDayOfWeekDistribution: Monday-first 並べ替え
// =============================================================================

describe('statistics.getDayOfWeekDistribution (proProcedure)', () => {
  it('日曜始まり (dow=0..6) を月曜始まりに並べ替えて返す', async () => {
    // dow=0 は Sunday, dow=1 は Monday, ..., dow=6 は Saturday
    const rows = [
      { dow: 0, total_minutes: 60 }, // 日: 1h
      { dow: 1, total_minutes: 120 }, // 月: 2h
      { dow: 6, total_minutes: 30 }, // 土: 0.5h
    ];
    const rpc = vi.fn().mockResolvedValueOnce({ data: rows, error: null });
    const caller = createCaller(authedCtx(rpc));

    const result = await caller.getDayOfWeekDistribution();

    expect(result).toHaveLength(7);
    // 月曜が先頭、日曜が末尾
    expect(result[0]).toEqual({ day: '月', hours: 2 });
    expect(result[5]).toEqual({ day: '土', hours: 0.5 });
    expect(result[6]).toEqual({ day: '日', hours: 1 });
  });
});
