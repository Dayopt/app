import { addWeeks, endOfWeek, startOfWeek } from '@/lib/date/core';
import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

/**
 * Stats ビュー用 prefetch
 *
 * デフォルト粒度（week）の日付範囲 + 前期間（TrendBadge 用）を事前取得する。
 */
export async function prefetchStatsData() {
  const helpers = await createServerHelpers();

  const now = new Date();
  const dateRange = {
    startDate: startOfWeek(now).toISOString(),
    endDate: endOfWeek(now).toISOString(),
  };

  const prevWeek = addWeeks(now, -1);
  const prevDateRange = {
    startDate: startOfWeek(prevWeek).toISOString(),
    endDate: endOfWeek(prevWeek).toISOString(),
  };

  await Promise.all([
    // Overview charts
    helpers.entries.getDailyHours.prefetch({ year: now.getFullYear() }),
    helpers.entries.getTimeByTag.prefetch(dateRange),
    helpers.entries.getHourlyDistribution.prefetch(dateRange),
    helpers.entries.getDayOfWeekDistribution.prefetch(dateRange),
    helpers.entries.getMonthlyTrend.prefetch({ months: 3 }),
    // KPI metrics（現在期間）
    helpers.entries.getCumulativeTime.prefetch(dateRange),
    helpers.entries.getAvgFulfillment.prefetch(dateRange),
    helpers.entries.getPlanRate.prefetch(dateRange),
    helpers.entries.getEstimationAccuracy.prefetch(dateRange),
    helpers.entries.getEnergyMap.prefetch(dateRange),
    helpers.entries.getContextSwitches.prefetch(dateRange),
    helpers.entries.getBlankRate.prefetch(dateRange),
    // KPI metrics（前期間 — TrendBadge 用）
    helpers.entries.getCumulativeTime.prefetch(prevDateRange),
    helpers.entries.getAvgFulfillment.prefetch(prevDateRange),
    helpers.entries.getPlanRate.prefetch(prevDateRange),
    helpers.entries.getEstimationAccuracy.prefetch(prevDateRange),
    helpers.entries.getEnergyMap.prefetch(prevDateRange),
    helpers.entries.getContextSwitches.prefetch(prevDateRange),
    helpers.entries.getBlankRate.prefetch(prevDateRange),
  ]);

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
