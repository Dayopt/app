import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const serviceMethods = vi.hoisted(() => ({
  getActiveDates: vi.fn(),
  getBlankRate: vi.fn(),
  getDailyHours: vi.fn(),
  getDayOfWeekDistribution: vi.fn(),
  getEstimationAccuracy: vi.fn(),
  getHourlyDistribution: vi.fn(),
  getMonthlyTrend: vi.fn(),
  getStatsOverview: vi.fn(),
  getStatsPageData: vi.fn(),
  getTagDashboard: vi.fn(),
  getTagStats: vi.fn(),
  getTimeByTag: vi.fn(),
  getTimePLData: vi.fn(),
}));
const getMcpReview = vi.hoisted(() => vi.fn());

vi.mock('../statistics-service', () => ({
  StatisticsService: class {
    getActiveDates = serviceMethods.getActiveDates;
    getBlankRate = serviceMethods.getBlankRate;
    getDailyHours = serviceMethods.getDailyHours;
    getDayOfWeekDistribution = serviceMethods.getDayOfWeekDistribution;
    getEstimationAccuracy = serviceMethods.getEstimationAccuracy;
    getHourlyDistribution = serviceMethods.getHourlyDistribution;
    getMonthlyTrend = serviceMethods.getMonthlyTrend;
    getStatsOverview = serviceMethods.getStatsOverview;
    getStatsPageData = serviceMethods.getStatsPageData;
    getTagDashboard = serviceMethods.getTagDashboard;
    getTagStats = serviceMethods.getTagStats;
    getTimeByTag = serviceMethods.getTimeByTag;
    getTimePLData = serviceMethods.getTimePLData;
  },
}));

vi.mock('../timeblock-review-service', () => ({
  createTimeblockReviewService: () => ({ getMcpReview }),
}));

import { statisticsQueriesRouter } from '../statistics';
import { tagStatisticsRouter } from '../tag-statistics';

const createCaller = createCallerFactory(statisticsQueriesRouter);
const createTagCaller = createCallerFactory(tagStatisticsRouter);
const USER_ID = 'user-1';
const START = '2026-04-01T00:00:00.000Z';
const END = '2026-04-30T23:59:59.000Z';

function authedCaller() {
  const ctx = Object.assign(createMockContext({ userId: USER_ID }), {
    subscriptionStatus: 'active' as const,
  });
  return createCaller(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of Object.values(serviceMethods)) method.mockResolvedValue([]);
  getMcpReview.mockResolvedValue({
    asOf: '2026-07-24T10:00:00.000Z',
    hasData: false,
  });
  serviceMethods.getTagStats.mockResolvedValue({ counts: {}, lastUsed: {} });
  serviceMethods.getBlankRate.mockResolvedValue({
    availableMinutes: 0,
    scheduledMinutes: 0,
    blankMinutes: 0,
    blankRate: 0,
  });
});

describe('statistics router: 認証ガード', () => {
  it('未認証で getTagStats は UNAUTHORIZED', async () => {
    const caller = createCaller(createMockContext({ userId: undefined }));
    await expect(caller.getTagStats()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('statistics router: StatisticsService 委譲', () => {
  it('general procedures を plans / records service へ渡す', async () => {
    const caller = authedCaller();
    const range = { startDate: START, endDate: END };

    await caller.getTagStats();
    await caller.getTimeByTag(range);
    await caller.getDailyHours({ year: 2026 });
    await caller.getHourlyDistribution(range);
    await caller.getDayOfWeekDistribution(range);
    await caller.getMonthlyTrend({ months: 6 });

    expect(serviceMethods.getTagStats).toHaveBeenCalledWith(USER_ID);
    expect(serviceMethods.getTimeByTag).toHaveBeenCalledWith(USER_ID, range);
    expect(serviceMethods.getDailyHours).toHaveBeenCalledWith(USER_ID, 2026);
    expect(serviceMethods.getHourlyDistribution).toHaveBeenCalledWith(USER_ID, range);
    expect(serviceMethods.getDayOfWeekDistribution).toHaveBeenCalledWith(USER_ID, range);
    expect(serviceMethods.getMonthlyTrend).toHaveBeenCalledWith(USER_ID, 6);
  });

  it('KPI procedures を plans / records service へ渡す', async () => {
    const caller = authedCaller();
    const range = { startDate: START, endDate: END };
    const blankInput = { ...range, wakeHour: 7, sleepHour: 23 };

    await caller.getEstimationAccuracy(range);
    await caller.getBlankRate(blankInput);
    await caller.getStatsOverview(blankInput);

    expect(serviceMethods.getEstimationAccuracy).toHaveBeenCalledWith(USER_ID, range);
    expect(serviceMethods.getBlankRate).toHaveBeenCalledWith(USER_ID, blankInput);
    expect(serviceMethods.getStatsOverview).toHaveBeenCalledWith(USER_ID, blankInput);
  });

  it('Review procedures の表示日キーを service へ渡す', async () => {
    const caller = authedCaller();
    const timePLInput = {
      startDate: START,
      endDate: END,
      visibleDateKeys: ['2026-04-01', '2026-04-02'],
      prevVisibleDateKeys: ['2026-03-30', '2026-03-31'],
      wakeHour: 7,
      sleepHour: 23,
    };
    const pageInput = {
      ...timePLInput,
      prevStart: '2026-03-01T00:00:00.000Z',
      prevEnd: '2026-03-31T23:59:59.000Z',
      year: 2026,
      monthlyMonths: 3,
    };

    await caller.getTimePL(timePLInput);
    await caller.getStatsPageData(pageInput);

    expect(serviceMethods.getTimePLData).toHaveBeenCalledWith(USER_ID, timePLInput);
    expect(serviceMethods.getStatsPageData).toHaveBeenCalledWith(USER_ID, pageInput);
  });

  it('MCP reviewはverified user・strict range・request signalを専用serviceへ渡す', async () => {
    const caller = authedCaller();
    const input = {
      startDate: '2026-07-20T00:00:00+09:00',
      endDate: '2026-07-27T00:00:00+09:00',
    };

    await expect(caller.getMcpReview(input)).resolves.toMatchObject({
      asOf: '2026-07-24T10:00:00.000Z',
    });
    expect(getMcpReview).toHaveBeenCalledWith(USER_ID, input, undefined);

    await expect(
      caller.getMcpReview({
        ...input,
        userId: 'foreign-user',
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(getMcpReview).toHaveBeenCalledOnce();
  });

  it('Review procedures は不正または上限超過の表示日キーを拒否する', async () => {
    await expect(
      authedCaller().getTimePL({
        startDate: START,
        endDate: END,
        visibleDateKeys: ['2026-02-30'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await expect(
      authedCaller().getTimePL({
        startDate: START,
        endDate: END,
        visibleDateKeys: Array.from(
          { length: 10 },
          (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`,
        ),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(serviceMethods.getTimePLData).not.toHaveBeenCalled();
  });

  it('tag dashboard を plans / records service へ渡す', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const input = { tagId: '00000000-0000-4000-8000-000000000001', startDate: START, endDate: END };

    await createTagCaller(ctx).getTagDashboard(input);

    expect(serviceMethods.getTagDashboard).toHaveBeenCalledWith(USER_ID, { ...input, limit: 50 });
  });

  it('service error を INTERNAL_SERVER_ERROR に正規化する', async () => {
    serviceMethods.getTagStats.mockRejectedValueOnce(new Error('db down'));
    await expect(authedCaller().getTagStats()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});
