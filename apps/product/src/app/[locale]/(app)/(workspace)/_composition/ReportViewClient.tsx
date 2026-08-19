'use client';

/**
 * ReportViewClient - Composition Bridge for `/report`
 *
 * `/report` の期間契約（`?date=&range=`）から表示範囲を組み立て、差分（セクション1）用に
 * timeblock を取得して計算する。`features/review` は同層の `features/calendar` を import
 * できないため（feature-boundaries.md、同層 import 禁止）、この橋渡しを Composition Layer
 * が担う（overview.md §6-9 #D）。
 *
 * Time P/L 等（セクション2）は features/review 自身の tRPC hook が displayRange を受けて
 * 取得するため、ここでは timeblock 取得と diff 計算だけを行う。
 */

import { useMemo } from 'react';

import {
  buildTimeblockDayDiffPlans,
  buildTimeblockDayDiffRecords,
  computeTimeblockDayDiffs,
  resolveTimeblockDayDiffBounds,
  resolveTimeblockRangeDiffBounds,
} from '@/features/timeblock';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

import { useCalendarData, useCalendarSettings } from '@/features/calendar';
import {
  buildReportDisplayRange,
  ReportBody,
  type ReportDiffState,
  type ReviewDisplayRange,
  type ReviewGranularity,
} from '@/features/review';

interface ReportViewClientProps {
  date: Date;
  range: ReviewGranularity;
}

export function ReportViewClient({ date, range }: ReportViewClientProps) {
  const showWeekends = useCalendarSettings((s) => s.showWeekends);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);
  const timezone = useUserPreferences((s) => s.timezone);

  const displayRange: ReviewDisplayRange = useMemo(
    () => buildReportDisplayRange(date, range, showWeekends, weekStartsOn),
    [date, range, showWeekends, weekStartsOn],
  );

  const { allCalendarEvents, viewDateRange, timeblocksError, isTimeblocksLoading } =
    useCalendarData({ viewType: range, currentDate: date, showWeekends });

  const diffData = useMemo(() => {
    if (isTimeblocksLoading || timeblocksError) return null;

    const dayBounds = viewDateRange.days.map((day) => resolveTimeblockDayDiffBounds(day, timezone));
    const bounds =
      range === 'day'
        ? resolveTimeblockDayDiffBounds(date, timezone)
        : resolveTimeblockRangeDiffBounds(
            viewDateRange.days[0] ?? viewDateRange.start,
            viewDateRange.days[viewDateRange.days.length - 1] ?? viewDateRange.end,
            timezone,
          );

    // /report の集計はタグ/アクティビティ可視性フィルタに従わない（全アクティビティ対象。
    // overview.md §6-9 #C。#2162 §3 の不変条件「Σカテゴリー + 未分類 = 全ブロック時間」を守る）。
    const plans = buildTimeblockDayDiffPlans(allCalendarEvents, {
      dayBounds,
      isEntryVisible: () => true,
    });
    const records = buildTimeblockDayDiffRecords(allCalendarEvents, {
      dayBounds,
      isEntryVisible: () => true,
    });

    return computeTimeblockDayDiffs(plans, records, bounds);
  }, [
    allCalendarEvents,
    date,
    isTimeblocksLoading,
    range,
    timeblocksError,
    timezone,
    viewDateRange,
  ]);

  const diff: ReportDiffState = {
    data: diffData,
    isPending: isTimeblocksLoading,
    isError: timeblocksError != null,
  };

  return <ReportBody currentDate={date} displayRange={displayRange} diff={diff} />;
}
