'use client';

import { useMemo } from 'react';

import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { api } from '@/lib/trpc';

import {
  computeMonthCount,
  computePreviousDateRange,
  computeStatsDateRange,
} from '../lib/compute-date-range';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import type { StatsPageData } from '../types/metrics.types';

/**
 * useStatsPageData — Stats ページ全データを 1 RPC で取得
 *
 * 従来 12 個の useQuery を 1 つに統合。
 * TanStack Query キャッシュキーが prefetch と一致するため、
 * サーバーサイドプリフェッチからのキャッシュヒットが保証される。
 */
export function useStatsPageData() {
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );
  const prevDateRange = useMemo(
    () => computePreviousDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const input = useMemo(
    () => ({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      prevStart: prevDateRange.startDate,
      prevEnd: prevDateRange.endDate,
      year: currentDate.getFullYear(),
      monthlyMonths: computeMonthCount(granularity) ?? 12,
    }),
    [dateRange, prevDateRange, currentDate, granularity],
  );

  const query = api.entries.getStatsPageData.useQuery(input);

  return {
    data: query.data as StatsPageData | undefined,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    dateRange,
    prevDateRange,
  };
}
