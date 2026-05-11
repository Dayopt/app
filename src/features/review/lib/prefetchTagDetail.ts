import 'server-only';

import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';
import { computeStatsDateRange } from './compute-date-range';

/**
 * タグ詳細ページ用 prefetch
 *
 * 旧: 個別8本のRPC → 新: getTagOverview (7並列) + getTagTimeline (2並列) の2本。
 * クライアント側と同じクエリキーでプリフェッチ → キャッシュヒット保証。
 */
export async function prefetchTagDetailData(
  tagId: string,
  granularity: ReviewGranularity = 'week',
  dateStr?: string,
) {
  const helpers = await createServerHelpers();

  const currentDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(currentDate, granularity, serverTimezone);

  try {
    await Promise.all([
      helpers.entries.getTagDashboard.prefetch({
        tagId,
        limit: 50,
        ...dateRange,
      }),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側で処理）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
