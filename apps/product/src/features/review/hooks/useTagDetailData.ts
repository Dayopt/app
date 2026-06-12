'use client';

/**
 * タグ詳細ダッシュボードのデータ取得フック。
 *
 * 集計値とエントリ一覧を getTagDashboard の単一 tRPC 呼び出しで取得する。
 */

import { useMemo } from 'react';

import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { cacheStrategies } from '@/lib/tanstack-query/cache-config';
import { api } from '@/lib/trpc';

import { computeStatsDateRange } from '../lib/compute-date-range';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';

const TAG_DASHBOARD_ENTRY_LIMIT = 50;

export function useTagDashboardData(tagId: string) {
  const granularity = useReviewFilterStore((s) => s.granularity);
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const timezone = useUserPreferenceStore((s) => s.timezone);
  const weekStartsOn = useUserPreferenceStore((s) => s.weekStartsOn);

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
