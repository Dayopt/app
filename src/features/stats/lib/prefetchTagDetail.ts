import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/platform/trpc/server';

import { computeStatsDateRange } from '../utils/computeDateRange';

/**
 * タグ詳細ページ用 prefetch
 *
 * getTagOverview + getTagTimeline を SSR でプリフェッチし、
 * クライアントのハイドレーションでキャッシュヒットさせる。
 */
export async function prefetchTagDetailData(tagId: string, tagName: string) {
  const helpers = await createServerHelpers();

  const now = new Date();
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(now, 'week', serverTimezone);

  try {
    await Promise.all([
      helpers.entries.getTagOverview.prefetch({
        tagId,
        tagName,
        ...dateRange,
      }),
      helpers.entries.getTagTimeline.prefetch({
        tagId,
        ...dateRange,
        bucket: 'week',
      }),
    ]);
  } catch {
    // 認証エラー等はスキップ（クライアント側で処理）
  }

  return { helpers, dehydratedState: dehydrate(helpers.queryClient) };
}
