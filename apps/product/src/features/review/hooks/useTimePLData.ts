'use client';

import { useMemo } from 'react';

import { formatInTimeZone } from 'date-fns-tz';

import { resolveCategoryColor } from '@/features/activities';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { api } from '@/lib/trpc';

import type { TimePLInput } from '../domain/timePL/types';
import {
  computeCalendarDisplayDateRanges,
  computePreviousDateRange,
  computeStatsDateRange,
  type ReviewDisplayRange,
} from '../lib/compute-date-range';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';

/** getTimePL procedure のレスポンス型。#2162 でアクティビティ軸へ移行。 */
interface TimePLRpcResponse {
  activities: Array<{
    activityId: string | null;
    activityName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
    isNoActivity: boolean;
  }>;
  prevActivities: Array<{
    activityId: string | null;
    activityName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
    isNoActivity: boolean;
  }>;
  availableMinutes: number;
}

/**
 * useTimePLData — Time P/L 用データを専用 RPC で取得し TimePLInput に変換
 *
 * Calendar の displayRange を優先し、未指定時は useReviewFilterStore の週次範囲を使う。
 * DB から予実データ + 日次ポイントを取得して TimePLInput に詰める。
 */
export function useTimePLData(displayRange?: ReviewDisplayRange | undefined) {
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const granularity = useReviewFilterStore((s) => s.granularity);
  const timezone = useUserPreferences((s) => s.timezone);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);

  const { dateRange, prevDateRange, dayCount, visibleDateKeys, prevVisibleDateKeys } =
    useMemo(() => {
      if (displayRange) {
        return computeCalendarDisplayDateRanges(displayRange, timezone);
      }

      return {
        dateRange: computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
        prevDateRange: computePreviousDateRange(currentDate, granularity, timezone, weekStartsOn),
        dayCount: 7,
        visibleDateKeys: undefined,
        prevVisibleDateKeys: undefined,
      };
    }, [currentDate, displayRange, granularity, timezone, weekStartsOn]);

  const input = useMemo(
    () => ({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      prevStart: prevDateRange.startDate,
      prevEnd: prevDateRange.endDate,
      ...(visibleDateKeys ? { visibleDateKeys } : {}),
      ...(prevVisibleDateKeys ? { prevVisibleDateKeys } : {}),
    }),
    [dateRange, prevDateRange, prevVisibleDateKeys, visibleDateKeys],
  );

  const query = api.statistics.getTimePL.useQuery(input);

  const timePLInput: TimePLInput | null = useMemo(() => {
    const data = query.data as TimePLRpcResponse | undefined;
    if (!data || data.activities.length === 0) return null;

    return {
      period: {
        granularity: dayCount === 1 ? 'day' : dayCount === 7 ? 'week' : 'range',
        label: formatPeriodLabel(dateRange, timezone),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
      availableMinutes: data.availableMinutes,
      activities: data.activities.map((a) => ({
        activityId: a.activityId,
        activityName: a.activityName,
        categoryColor: a.isNoActivity ? null : resolveCategoryColor(a.categoryColor),
        categoryIcon: a.categoryIcon,
        budgetMinutes: a.budgetMinutes,
        actualMinutes: a.actualMinutes,
        isPlanned: a.isPlanned,
        isNoActivity: a.isNoActivity,
      })),
      prevActivities:
        data.prevActivities.length > 0
          ? data.prevActivities.map((a) => ({
              activityId: a.activityId,
              activityName: a.activityName,
              categoryColor: a.isNoActivity ? null : resolveCategoryColor(a.categoryColor),
              categoryIcon: a.categoryIcon,
              budgetMinutes: a.budgetMinutes,
              actualMinutes: a.actualMinutes,
              isPlanned: a.isPlanned,
              isNoActivity: a.isNoActivity,
            }))
          : undefined,
    };
  }, [query.data, dayCount, dateRange, timezone]);

  return {
    data: timePLInput,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}

// ── Internal ──

function formatPeriodLabel(
  dateRange: { startDate: string; endDate: string },
  timezone: string,
): string {
  const start = formatInTimeZone(new Date(dateRange.startDate), timezone, 'M/d');
  const end = formatInTimeZone(new Date(dateRange.endDate), timezone, 'M/d');
  return start === end ? start : `${start}–${end}`;
}
