'use client';

import { useMemo } from 'react';

import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { api } from '@/lib/trpc';

import {
  computeCalendarDisplayDateRanges,
  computeMonthCount,
  computePreviousDateRange,
  computeStatsDateRange,
  resolveReviewQueryYear,
  type ReviewDisplayRange,
} from '../lib/compute-date-range';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import type { StatsPageData } from '../types/metrics.types';

/**
 * useReviewPageData — Review panel 用データを 1 RPC で取得
 *
 * 従来 12 個の useQuery を 1 つに統合。
 * Calendar から displayRange が渡された場合は、その期間と直前の同日数を使う。
 * 未指定時だけ useReviewFilterStore の週次範囲へフォールバックする。
 *
 * TanStack Query キャッシュキーが prefetch と一致するため、
 * サーバーサイドプリフェッチからのキャッシュヒットが保証される。
 */
export function useReviewPageData(
  displayRange?: ReviewDisplayRange | undefined,
  calendarDate?: Date | undefined,
) {
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const granularity = useReviewFilterStore((s) => s.granularity);
  const timezone = useUserPreferences((s) => s.timezone);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);

  const { dateRange, prevDateRange } = useMemo(() => {
    if (displayRange) {
      return computeCalendarDisplayDateRanges(displayRange, timezone);
    }

    return {
      dateRange: computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
      prevDateRange: computePreviousDateRange(currentDate, granularity, timezone, weekStartsOn),
    };
  }, [currentDate, displayRange, granularity, timezone, weekStartsOn]);
  const queryYear = resolveReviewQueryYear(calendarDate, currentDate);
  const input = useMemo(
    () => ({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      prevStart: prevDateRange.startDate,
      prevEnd: prevDateRange.endDate,
      year: queryYear,
      monthlyMonths: computeMonthCount(granularity),
    }),
    [dateRange, prevDateRange, queryYear, granularity],
  );

  const query = api.statistics.getStatsPageData.useQuery(input);

  return {
    data: query.data as StatsPageData | undefined,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    dateRange,
    prevDateRange,
  };
}
