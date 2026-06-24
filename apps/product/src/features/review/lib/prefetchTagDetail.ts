import 'server-only';

import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';
import { computeStatsDateRange } from './compute-date-range';

/**
 * タグ詳細ページ用 prefetch
 *
 * getTagDashboard をクライアント側と同じクエリキーでプリフェッチ → キャッシュヒット保証。
 */
export async function prefetchTagDetailData(
  tagId: string,
  granularity: ReviewGranularity = 'week',
  dateStr?: string,
) {
  const helpers = await createServerHelpers();

  const parsed = dateStr ? new Date(dateStr + 'T00:00:00') : null;
  const currentDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
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
