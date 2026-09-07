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
  getActivityStats: vi.fn(),
}));

vi.mock('./statistics-service', () => ({
  StatisticsService: class {
    getActiveDates = serviceMethods.getActiveDates;
    getBlankRate = serviceMethods.getBlankRate;
    getDailyHours = serviceMethods.getDailyHours;
    getDayOfWeekDistribution = serviceMethods.getDayOfWeekDistribution;
    getEstimationAccuracy = serviceMethods.getEstimationAccuracy;
    getHourlyDistribution = serviceMethods.getHourlyDistribution;
    getMonthlyTrend = serviceMethods.getMonthlyTrend;
    getStatsOverview = serviceMethods.getStatsOverview;
    getActivityStats = serviceMethods.getActivityStats;
  },
}));

import { statisticsQueriesRouter } from './statistics';

const createCaller = createCallerFactory(statisticsQueriesRouter);
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
  serviceMethods.getActivityStats.mockResolvedValue({ counts: {}, planCounts: {}, lastUsed: {} });
  serviceMethods.getBlankRate.mockResolvedValue({
    availableMinutes: 0,
    scheduledMinutes: 0,
    blankMinutes: 0,
    blankRate: 0,
  });
});

// 「未認証は UNAUTHORIZED」の契約は write-fence-coverage.test.ts が全 procedure 横断で
// 機械検証する（#2187 E-3）。ここでの個別 assert（getActivityStats）は重複だったため削除した。

describe('statistics router: StatisticsService 委譲', () => {
  it('general procedures を plans / records service へ渡す', async () => {
    const caller = authedCaller();
    const range = { startDate: START, endDate: END };

    await caller.getActivityStats();
    await caller.getDailyHours({ year: 2026 });
    await caller.getHourlyDistribution(range);
    await caller.getDayOfWeekDistribution(range);
    await caller.getMonthlyTrend({ months: 6 });

    expect(serviceMethods.getActivityStats).toHaveBeenCalledWith(USER_ID);
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

  it('service error を INTERNAL_SERVER_ERROR に正規化する', async () => {
    serviceMethods.getActivityStats.mockRejectedValueOnce(new Error('db down'));
    await expect(authedCaller().getActivityStats()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});
