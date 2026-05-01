import 'server-only';

import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

import { computePreviousDateRange, computeStatsDateRange } from './compute-date-range';

/**
 * Review ページ用 prefetch
 *
 * 4 クエリで Review 画面に必要なデータを事前取得:
 * 1. getStatsPageData: 統合クエリ（Review 表示データ）
 * 2. getStreak: 連続記録日数（期間非依存のため統合不可）
 * 3. getDailyHours: 年間ヒートマップ（年パラメータが動的なため統合不可）
 * 4. getTimePL: Time P/L データ（デフォルト week 粒度）
 */
export async function prefetchReviewData() {
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
      helpers.entries.getTimePL.prefetch({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        prevStart: prevDateRange.startDate,
        prevEnd: prevDateRange.endDate,
      }),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側でリトライ）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
