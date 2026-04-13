import 'server-only';

import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

import { computePreviousDateRange, computeStatsDateRange } from './compute-date-range';

/**
 * Stats ページ用 prefetch
 *
 * 3 クエリで全タブのデータを事前取得:
 * 1. getStatsPageData: 統合クエリ（Review/Progress/Insights 全データ）
 * 2. getStreak: 連続記録日数（期間非依存のため統合不可）
 * 3. getDailyHours: 年間ヒートマップ（年パラメータが動的なため統合不可）
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
      helpers.entries.getStatsPageData.prefetch({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        prevStart: prevDateRange.startDate,
        prevEnd: prevDateRange.endDate,
        year: now.getFullYear(),
        monthlyMonths: 3,
      }),
      helpers.entries.getStreak.prefetch(),
      helpers.entries.getDailyHours.prefetch({ year: now.getFullYear() }),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側でリトライ）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
