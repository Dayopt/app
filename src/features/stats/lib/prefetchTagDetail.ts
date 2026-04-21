import 'server-only';

import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { computeStatsDateRange } from './compute-date-range';

/**
 * タグ詳細ページ用 prefetch
 *
 * 旧: 個別8本のRPC → 新: getTagOverview (7並列) + getTagTimeline (2並列) の2本。
 * クライアント側と同じクエリキーでプリフェッチ → キャッシュヒット保証。
 */
export async function prefetchTagDetailData(
  tagId: string,
  granularity: StatsGranularity = 'week',
  tagName: string = '',
) {
  const helpers = await createServerHelpers();

  const now = new Date();
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(now, granularity, serverTimezone);

  try {
    await Promise.all([
      helpers.entries.getTagOverview.prefetch({
        tagId,
        tagName: tagName || tagId,
        ...dateRange,
      }),
      helpers.entries.getTagTimeline.prefetch({
        tagId,
        bucket: granularity === 'day' ? 'day' : granularity === 'year' ? 'month' : 'week',
        recentLimit: 8,
        ...dateRange,
      }),
      helpers.entries.list.prefetch({
        tagId,
        sortBy: 'start_time',
        sortOrder: 'desc',
        limit: 10,
      }),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側で処理）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
