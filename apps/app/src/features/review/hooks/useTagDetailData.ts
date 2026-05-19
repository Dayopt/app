'use client';

/**
 * タグ詳細データ統合フック
 *
 * 個別8本のRPCを getTagOverview (7並列) + getTagTimeline (2並列) の
 * 2本のtRPC呼び出しに統合し、tRPCラウンドトリップを削減する。
 */

import { useCallback, useMemo, useState } from 'react';

import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { cacheStrategies } from '@/lib/tanstack-query/cache-config';
import { api } from '@/lib/trpc';

import { computeStatsDateRange } from '../lib/compute-date-range';
import type { ReviewGranularity } from '../stores/useReviewFilterStore';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';

const TAG_ENTRIES_PAGE_SIZE = 10;
const TAG_DASHBOARD_ENTRY_LIMIT = 50;

function granularityToBucket(g: ReviewGranularity): 'week' | 'month' | 'day' {
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
 */
export function useTagOverviewData(tagId: string) {
  const granularity = useReviewFilterStore((s) => s.granularity);
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  return api.entries.getTagOverview.useQuery({
    tagId,
    ...dateRange,
  });
}

export function useTagTimelineData(tagId: string) {
  const granularity = useReviewFilterStore((s) => s.granularity);
  const currentDate = useReviewFilterStore((s) => s.currentDate);
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

export function useTagDashboardData(tagId: string) {
  const granularity = useReviewFilterStore((s) => s.granularity);
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  return api.entries.getTagDashboard.useQuery(
    {
      tagId,
      ...dateRange,
      limit: TAG_DASHBOARD_ENTRY_LIMIT,
    },
    {
      ...cacheStrategies.entries,
      retry: 1,
    },
  );
}

/**
 * タグに紐づくエントリ一覧を取得するフック（ページネーション付き）。
 *
 * entries.list エンドポイントを tagId フィルタ付きで使用し、
 * 「もっと見る」ボタンで limit を増やしていく方式。
 */
export function useTagRecentEntries(tagId: string) {
  const [limit, setLimit] = useState(TAG_ENTRIES_PAGE_SIZE);

  const result = api.entries.list.useQuery(
    {
      tagId,
      sortBy: 'start_time',
      sortOrder: 'desc',
      limit,
    },
    {
      ...cacheStrategies.entries,
      retry: 1,
    },
  );

  // entries.list は start_time / end_time が null の未スケジュール行も返す。
  // TagRecentBlocks は timed entry 前提で日時を表示するため、null 時刻を除外して
  // 未スケジュール行が timeline を圧迫しないようにする。
  const timedEntries = useMemo(
    () => result.data?.filter((e) => e.start_time != null && e.end_time != null),
    [result.data],
  );

  // hasMore は「可視行が limit に達したか」で判定。raw length で判定すると
  // null 時刻行で埋まった page でも Load more が出続けて UI が更新されない問題になる
  const hasMore = (timedEntries?.length ?? 0) >= limit;

  const loadMore = useCallback(() => {
    setLimit((prev) => prev + TAG_ENTRIES_PAGE_SIZE);
  }, []);

  return { ...result, data: timedEntries, hasMore, loadMore };
}
