import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

import { computeStatsDateRange } from '../utils/computeDateRange';

/**
 * タグ詳細ページ用 prefetch
 *
 * クライアントのコンポーネントが使う個別クエリと同じキーでプリフェッチし、
 * ハイドレーション時にキャッシュヒットさせる。
 */
export async function prefetchTagDetailData(tagId: string) {
  const helpers = await createServerHelpers();

  const now = new Date();
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(now, 'week', serverTimezone);

  const tagDateRange = { tagId, ...dateRange };

  try {
    await Promise.all([
      // Hero で使用する3クエリ
      helpers.entries.getTagCumulativeTime.prefetch(tagDateRange),
      helpers.entries.getTagAvgFulfillment.prefetch(tagDateRange),
      helpers.entries.getTagPlanRate.prefetch(tagDateRange),
      // チャートで使用するクエリ
      helpers.entries.getTagHourlyDistribution.prefetch(tagDateRange),
      helpers.entries.getTagDowDistribution.prefetch(tagDateRange),
      helpers.entries.getTagFulfillmentDistribution.prefetch(tagDateRange),
      helpers.entries.getTagAccuracyTrend.prefetch({ ...tagDateRange, bucket: 'week' }),
      helpers.entries.getTagRecentEntries.prefetch({ tagId }),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側で処理）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
