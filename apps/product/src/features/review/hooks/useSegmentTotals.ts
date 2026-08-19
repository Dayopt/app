'use client';

import { useMemo } from 'react';

import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { trpc } from '@/lib/trpc/client';

import type { ReviewDisplayRange } from '../lib/compute-date-range';
import { computeCalendarDisplayDateRanges } from '../lib/compute-date-range';

interface SegmentDefinition {
  id: string;
  name: string;
  activityIds: readonly string[];
}

/**
 * セグメント別の予実合計 + 直前期間比較を取得する（#2181 Step 5）。
 *
 * セグメント定義（`segments`）はこのフックの外（`useSegments`）で取得して渡す
 * （features/timeblock は Layer 1 のため Layer 2 の segments テーブルを持てない）。
 */
export function useSegmentTotals(
  displayRange: ReviewDisplayRange,
  segments: readonly SegmentDefinition[] | undefined,
) {
  const timezone = useUserPreferences((s) => s.timezone);

  const { dateRange, prevDateRange } = useMemo(
    () => computeCalendarDisplayDateRanges(displayRange, timezone),
    [displayRange, timezone],
  );

  const input = useMemo(
    () => ({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      prevStart: prevDateRange.startDate,
      prevEnd: prevDateRange.endDate,
      segments: (segments ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        activityIds: [...s.activityIds],
      })),
    }),
    [dateRange, prevDateRange, segments],
  );

  return trpc.statistics.getSegmentTotals.useQuery(input, {
    enabled: (segments?.length ?? 0) > 0,
  });
}
