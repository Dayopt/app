'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { Skeleton } from '@dayopt/components';

import {
  buildAllocationSlices,
  buildInkColumns,
  buildSegmentBars,
  computeDenominators,
  computePreviousDelta,
  computeUncategorizedPercent,
  defaultReportFilterState,
  maxInkColumnMinutes,
  resolveVisibleActivities,
} from '../../domain/report/report-view-model';
import { useReportPeriod } from '../../hooks/useReportPeriod';
import { useReviewOpenedTracking } from '../../hooks/useReviewOpenedTracking';
import { useSegments } from '../../hooks/useSegments';
import { AllocationChapter } from './chapters/AllocationChapter';

import type { ReportGranularity } from '../../lib/report-period';

interface ReportBodyProps {
  anchorDate: string;
  granularity: ReportGranularity;
}

/**
 * `/report` の本体（1 スクロール構成）。
 *
 * 章は決まった順に並び、折りたたみ・並び替え・非表示は持たない（仕様 §0-1）。
 * 現在は 1 章のみ。2〜4 章は後続の issue で足す。
 *
 * フィルタ（カテゴリ / 未分類 / 余白）とセグメントレンズはまだ UI が無いため、
 * 「すべて可視・余白 on」を既定として派生する。サイドバーの UI は #2578 で足す。
 */
export function ReportBody({ anchorDate, granularity }: ReportBodyProps) {
  const t = useTranslations('report.errors');
  useReviewOpenedTracking(true);

  const { data, isPending, isError } = useReportPeriod(anchorDate, granularity);
  const { data: segments } = useSegments();

  const view = useMemo(() => {
    if (!data) return null;

    const visible = resolveVisibleActivities(data.activities, defaultReportFilterState);
    const denominators = computeDenominators({
      allActivities: data.activities,
      visibleActivities: visible,
      lengthMinutes: data.period.lengthMinutes,
      marginVisible: !defaultReportFilterState.marginHidden,
    });
    const inkColumns = buildInkColumns(visible, data.period.bucketKeys);

    return {
      denominators,
      inkColumns,
      maxInkMinutes: maxInkColumnMinutes(inkColumns),
      slices: buildAllocationSlices(visible, denominators.trackMinutes, 'category'),
      segmentBars: buildSegmentBars(visible, segments ?? [], denominators.trackMinutes),
      uncategorizedPercent: computeUncategorizedPercent(visible, denominators.visibleMinutes),
      previousDeltaMinutes: computePreviousDelta({
        visibleMinutes: denominators.visibleMinutes,
        previousActivities: data.previousActivities,
        visibleActivityIds: new Set(visible.map((activity) => activity.activityId)),
      }),
    };
  }, [data, segments]);

  if (isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState title={t('title')} description={t('description')} />
      </div>
    );
  }

  if (isPending || !view) {
    return (
      <div className="flex flex-col gap-3 p-4 md:p-6">
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 md:p-6">
      <AllocationChapter
        granularity={granularity}
        denominators={view.denominators}
        slices={view.slices}
        segmentBars={view.segmentBars}
        inkColumns={view.inkColumns}
        maxInkMinutes={view.maxInkMinutes}
        uncategorizedPercent={view.uncategorizedPercent}
        previousDeltaMinutes={view.previousDeltaMinutes}
        marginVisible={!defaultReportFilterState.marginHidden}
      />
    </div>
  );
}
