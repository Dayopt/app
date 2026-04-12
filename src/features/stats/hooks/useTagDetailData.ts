'use client';

/**
 * タグ詳細データ統合フック
 *
 * 個別8本のRPCを getTagOverview (7並列) + getTagTimeline (2並列) の
 * 2本のtRPC呼び出しに統合し、tRPCラウンドトリップを削減する。
 */

import { useMemo } from 'react';

import { useCalendarSettingsStore } from '@/features/calendar';
import { api } from '@/lib/trpc';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../utils/computeDateRange';

function granularityToBucket(g: StatsGranularity): 'week' | 'month' | 'day' {
  switch (g) {
    case 'day':
      return 'day';
    case 'year':
      return 'month';
    default:
      return 'week';
  }
}

/**
 * タグ概要データ（7 RPC並列）を取得するフック。
 *
 * tagName はクエリキーに含まれるため、全コンポーネントで同一値を使う必要がある。
 * タグ名未取得時は tagId をフォールバックとして使い、prefetch キーと一致させる。
 */
export function useTagOverviewData(tagId: string, tagName?: string) {
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  // prefetch と同じフォールバック: tagName 未指定時は tagId
  const effectiveTagName = tagName || tagId;

  return api.entries.getTagOverview.useQuery({
    tagId,
    tagName: effectiveTagName,
    ...dateRange,
  });
}

export function useTagTimelineData(tagId: string) {
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const bucket = granularityToBucket(granularity);

  return api.entries.getTagTimeline.useQuery({
    tagId,
    bucket,
    recentLimit: 8,
    ...dateRange,
  });
}
