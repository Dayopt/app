import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../utils/computeDateRange';

/**
 * タグ詳細ページ用 prefetch
 *
 * URL searchParams から読み取った granularity を使い、
 * クライアント側と同じクエリキーでプリフェッチ → キャッシュヒット保証。
 */
export async function prefetchTagDetailData(tagId: string, granularity: StatsGranularity = 'week') {
  const helpers = await createServerHelpers();

  const now = new Date();
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(now, granularity, serverTimezone);

  const tagDateRange = { tagId, ...dateRange };

  try {
    await Promise.all([
      helpers.entries.getTagCumulativeTime.prefetch(tagDateRange),
      helpers.entries.getTagAvgFulfillment.prefetch(tagDateRange),
      helpers.entries.getTagPlanRate.prefetch(tagDateRange),
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
