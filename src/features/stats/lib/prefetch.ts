import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

import { computePreviousDateRange, computeStatsDateRange } from '../utils/computeDateRange';

/**
 * Stats ページ用 prefetch
 *
 * 1 RPC で全データを取得する統合エンドポイント getStatsPageData を使用。
 * streak のみ別クエリ（期間非依存のため統合不可）。
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
      // 統合クエリ: 12 RPC → 1 RPC
      helpers.entries.getStatsPageData.prefetch({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        prevStart: prevDateRange.startDate,
        prevEnd: prevDateRange.endDate,
        year: now.getFullYear(),
        monthlyMonths: 3,
      }),
      // ストリーク（期間非依存、統合不可）
      helpers.entries.getStreak.prefetch(),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側でリトライ）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
