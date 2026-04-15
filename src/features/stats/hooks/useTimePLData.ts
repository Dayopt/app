'use client';

import { useMemo } from 'react';

import { formatInTimeZone } from 'date-fns-tz';

// eslint-disable-next-line no-restricted-imports -- TODO: calendar settingsをlib層に抽出
import { useCalendarSettingsStore } from '@/features/calendar';
import { resolveTagColor } from '@/lib/tag-colors';
import { api } from '@/lib/trpc';

import type { TimePLInput } from '../components/time-pl/data/timePL.types';
import { computePreviousDateRange, computeStatsDateRange } from '../lib/compute-date-range';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';

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
  dailyPoints: Array<{
    label: string;
    budgetMinutes: number;
    actualMinutes: number;
  }>;
  availableMinutes: number;
}

/**
 * useTimePLData — Time P/L 用データを専用 RPC で取得し TimePLInput に変換
 *
 * useStatsFilterStore の粒度・日付を使い、
 * DB から予実データ + 日次ポイントを取得して TimePLInput に詰める。
 */
export function useTimePLData() {
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
    }),
    [dateRange, prevDateRange],
  );

  const query = api.entries.getTimePL.useQuery(input);

  const timePLInput: TimePLInput | null = useMemo(() => {
    const data = query.data as TimePLRpcResponse | undefined;
    if (!data || data.tags.length === 0) return null;

    return {
      period: {
        granularity,
        label: formatPeriodLabel(currentDate, granularity, timezone),
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
      dailyPoints: data.dailyPoints.length > 0 ? data.dailyPoints : undefined,
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
  }, [query.data, granularity, dateRange, timezone, currentDate]);

  return {
    data: timePLInput,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}

// ── Internal ──

function formatPeriodLabel(
  date: Date,
  granularity: 'day' | 'week' | 'month' | 'year',
  timezone: string,
): string {
  switch (granularity) {
    case 'day':
      return formatInTimeZone(date, timezone, 'M/d（E）');
    case 'week':
      return formatInTimeZone(date, timezone, 'M/d') + '〜';
    case 'month':
      return formatInTimeZone(date, timezone, 'yyyy年M月');
    case 'year':
      return formatInTimeZone(date, timezone, 'yyyy年');
  }
}
