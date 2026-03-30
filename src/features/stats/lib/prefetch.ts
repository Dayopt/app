import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

import { computePreviousDateRange, computeStatsDateRange } from '../utils/computeDateRange';

/**
 * Stats ビュー用 prefetch
 *
 * デフォルト粒度（week）の日付範囲 + 前期間（TrendBadge 用）を事前取得する。
 * KPI は統合エンドポイント getStatsOverview で 1 RPC にまとめる。
 *
 * ⚠ computeStatsDateRange を使用して日付文字列を生成する。
 *   サーバー/クライアント間で同じクエリキーを生成し、キャッシュヒットを保証するため。
 */
export async function prefetchStatsData() {
  const helpers = await createServerHelpers();

  const now = new Date();
  // middleware が `user-tz` Cookie から転送した `x-user-timezone` ヘッダーを使用
  // 初回アクセス時（Cookie未設定）は UTC にフォールバック
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(now, 'week', serverTimezone);
  const prevDateRange = computePreviousDateRange(now, 'week', serverTimezone);

  try {
    const queries = [
      // Overview charts
      helpers.entries.getDailyHours.prefetch({ year: now.getFullYear() }),
      helpers.entries.getTimeByTag.prefetch(dateRange),
      helpers.entries.getHourlyDistribution.prefetch(dateRange),
      helpers.entries.getDayOfWeekDistribution.prefetch(dateRange),
      helpers.entries.getMonthlyTrend.prefetch({ months: 3 }),
      // KPI unified（現在 + 前期間 = 2 RPC、旧: 14 RPC）
      helpers.entries.getStatsOverview.prefetch(dateRange),
      helpers.entries.getStatsOverview.prefetch(prevDateRange),
      // 個別クエリ（統合に含められないもの）
      helpers.entries.getEstimationAccuracy.prefetch(dateRange),
      helpers.entries.getEstimationAccuracy.prefetch(prevDateRange),
      helpers.entries.getEnergyMap.prefetch(dateRange),
      helpers.entries.getEnergyMap.prefetch(prevDateRange),
    ];

    await Promise.all(queries);
  } catch {
    // 認証エラー等の場合はprefetchをスキップ（白ページ防止）
    // クライアント側のtRPCがリトライ or 認証リダイレクトを処理する
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
