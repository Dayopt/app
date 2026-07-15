'use client';

import { useMemo } from 'react';

import { formatInTimeZone } from 'date-fns-tz';

import { resolveTagColor } from '@/features/tags';
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

/** get_time_pl_data RPC のレスポンス型 */
interface TimePLRpcResponse {
  tags: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    tagIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
  }>;
  prevTags: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    tagIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
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
    if (!data || data.tags.length === 0) return null;

    return {
      period: {
        granularity: dayCount === 1 ? 'day' : dayCount === 7 ? 'week' : 'range',
        label: formatPeriodLabel(dateRange, timezone),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
      availableMinutes: data.availableMinutes,
      tags: data.tags.map((t) => ({
        tagId: t.tagId,
        tagName: t.tagName,
        tagColor: resolveTagColor(t.tagColor),
        tagIcon: t.tagIcon,
        budgetMinutes: t.budgetMinutes,
        actualMinutes: t.actualMinutes,
        isPlanned: t.isPlanned,
      })),
      prevTags:
        data.prevTags.length > 0
          ? data.prevTags.map((t) => ({
              tagId: t.tagId,
              tagName: t.tagName,
              tagColor: resolveTagColor(t.tagColor),
              tagIcon: t.tagIcon,
              budgetMinutes: t.budgetMinutes,
              actualMinutes: t.actualMinutes,
              isPlanned: t.isPlanned,
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
