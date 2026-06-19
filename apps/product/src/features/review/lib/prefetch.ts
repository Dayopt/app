import 'server-only';

import { headers } from 'next/headers';

import { createServerHelpers, dehydrate } from '@/lib/trpc/server';

import type { ReviewGranularity } from '../stores/useReviewFilterStore';
import {
  computeMonthCount,
  computePreviousDateRange,
  computeStatsDateRange,
} from './compute-date-range';
import { parseReviewDateParam } from './date-param';

interface PrefetchReviewOptions {
  granularity?: ReviewGranularity | undefined;
  /** YYYY-MM-DD（URL の ?d=）。省略時は今日 */
  dateStr?: string | undefined;
}

/**
 * Review ページ用 prefetch
 *
 * URL の粒度・日付（?g=&d=）に合わせてクライアントと同じクエリキーで事前取得する:
 * - week: getStatsPageData + getTimePL
 */
export async function prefetchReviewData(options: PrefetchReviewOptions = {}) {
  const helpers = await createServerHelpers();

  const granularity = options.granularity ?? 'week';
  const baseDate = parseReviewDateParam(options.dateStr);
  const headersList = await headers();
  const serverTimezone = headersList.get('x-user-timezone') ?? 'UTC';
  const dateRange = computeStatsDateRange(baseDate, granularity, serverTimezone);
  const prevDateRange = computePreviousDateRange(baseDate, granularity, serverTimezone);

  try {
    await Promise.all([
      helpers.entries.getStatsPageData.prefetch({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        prevStart: prevDateRange.startDate,
        prevEnd: prevDateRange.endDate,
        year: baseDate.getFullYear(),
        monthlyMonths: computeMonthCount(granularity),
      }),
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
