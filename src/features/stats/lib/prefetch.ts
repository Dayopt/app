import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

import { computePreviousDateRange, computeStatsDateRange } from '../utils/computeDateRange';

/**
 * Stats ページ用 prefetch
 *
 * Review タブ: 統合エンドポイント getStatsPageData で 1 RPC。
 * Progress/Insights タブ: 個別エンドポイント（チャートが直接 useQuery するため）。
 * streak: 期間非依存のため別クエリ。
 *
 * ⚠ computeStatsDateRange でサーバー/クライアント間のクエリキー一致を保証。
 */
export async function prefetchStatsData() {
  const helpers = await createServerHelpers();

  const now = new Date();
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(now, 'week', serverTimezone);
  const prevDateRange = computePreviousDateRange(now, 'week', serverTimezone);

  try {
    await Promise.all([
      // === Review タブ: 統合クエリ ===
      helpers.entries.getStatsPageData.prefetch({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        prevStart: prevDateRange.startDate,
        prevEnd: prevDateRange.endDate,
        year: now.getFullYear(),
        monthlyMonths: 3,
      }),
      // === ストリーク（期間非依存） ===
      helpers.entries.getStreak.prefetch(),
      // === Progress/Insights タブ: 旧個別エンドポイント（チャート移行まで維持） ===
      helpers.entries.getDailyHours.prefetch({ year: now.getFullYear() }),
      helpers.entries.getTimeByTag.prefetch(dateRange),
      helpers.entries.getHourlyDistribution.prefetch(dateRange),
      helpers.entries.getDayOfWeekDistribution.prefetch(dateRange),
      helpers.entries.getMonthlyTrend.prefetch({ months: 3 }),
      helpers.entries.getStatsOverview.prefetch(dateRange),
      helpers.entries.getStatsOverview.prefetch(prevDateRange),
      helpers.entries.getEstimationAccuracy.prefetch(dateRange),
      helpers.entries.getEstimationAccuracy.prefetch(prevDateRange),
      helpers.entries.getEnergyMap.prefetch(dateRange),
      helpers.entries.getEnergyMap.prefetch(prevDateRange),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側でリトライ）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
