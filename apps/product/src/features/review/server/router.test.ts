import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const trackReviewOpened = vi.hoisted(() => vi.fn());
const getReportPeriod = vi.hoisted(() => vi.fn());

vi.mock('./review-analytics-service', () => ({ trackReviewOpened }));
vi.mock('./report-aggregation-service', () => ({
  createReportAggregationService: () => ({ getReportPeriod }),
}));

import { reviewRouter } from './router';

const createCaller = createCallerFactory(reviewRouter);

describe('review analytics router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackReviewOpened.mockResolvedValue(undefined);
  });

  // 「未認証は UNAUTHORIZED」の契約は write-fence-coverage.test.ts が全 procedure 横断で
  // 機械検証する（#2187 E-3）。ここでの個別 assert は重複だったため削除した。
  it('uses the authenticated context user without client input', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(caller.trackOpened()).resolves.toEqual({ success: true });
    expect(trackReviewOpened).toHaveBeenCalledWith('user-1');
  });
});

describe('review.getReportPeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReportPeriod.mockResolvedValue({ activities: [] });
  });

  it('client 入力ではなく認証済み context の userId で集計する', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await caller.getReportPeriod({
      anchorDate: '2026-09-04',
      granularity: 'week',
      timezone: 'Asia/Tokyo',
      weekStartsOn: 1,
    });

    expect(getReportPeriod).toHaveBeenCalledWith('user-1', {
      anchorDate: '2026-09-04',
      granularity: 'week',
      timezone: 'Asia/Tokyo',
      weekStartsOn: 1,
    });
  });

  it('不正な粒度を受け付けない（`day` は廃止した）', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(
      caller.getReportPeriod({
        anchorDate: '2026-09-04',
        // @ts-expect-error 廃止した粒度を渡した時に zod が弾くことを確かめる
        granularity: 'day',
        timezone: 'Asia/Tokyo',
        weekStartsOn: 1,
      }),
    ).rejects.toThrow();
    expect(getReportPeriod).not.toHaveBeenCalled();
  });

  it('不正な日付書式を受け付けない', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(
      caller.getReportPeriod({
        anchorDate: '2026/09/04',
        granularity: 'week',
        timezone: 'Asia/Tokyo',
        weekStartsOn: 1,
      }),
    ).rejects.toThrow();
    expect(getReportPeriod).not.toHaveBeenCalled();
  });

  it('週の開始曜日は 0 / 1 / 6 だけを受け付ける', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(
      caller.getReportPeriod({
        anchorDate: '2026-09-04',
        granularity: 'week',
        timezone: 'Asia/Tokyo',
        // @ts-expect-error 3 値以外は zod が弾く
        weekStartsOn: 3,
      }),
    ).rejects.toThrow();
    expect(getReportPeriod).not.toHaveBeenCalled();
  });
});
