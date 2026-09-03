'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { Skeleton } from '@dayopt/components';

import {
  applySegmentLens,
  buildAllocationSlices,
  buildInkColumns,
  buildSegmentBars,
  computeDenominators,
  computePreviousDelta,
  computeUncategorizedPercent,
  maxInkColumnMinutes,
  resolveVisibleActivities,
} from '../../domain/report/report-view-model';
import { useReportPeriod } from '../../hooks/useReportPeriod';
import { useReviewOpenedTracking } from '../../hooks/useReviewOpenedTracking';
import { useSegments } from '../../hooks/useSegments';
import { useReportViewStore } from '../../stores/useReportViewStore';
import { AllocationChapter } from './chapters/AllocationChapter';

import type { ReportFilterState } from '../../domain/report/report-view-model';
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
 * フィルタ（カテゴリー / 未分類 / 余白）とセグメントレンズは `useReportViewStore`
 * （端末ローカル）から読む。派生はすべて client の純粋関数で、トグルのたびに
 * サーバーへ往復しない（#2576 の設計）。
 */
export function ReportBody({ anchorDate, granularity }: ReportBodyProps) {
  const t = useTranslations('report.errors');
  useReviewOpenedTracking(true);

  const { data, isPending, isError } = useReportPeriod(anchorDate, granularity);
  const { data: segments } = useSegments();

  // オブジェクトを返す selector は毎 render で新しい参照になるため、値ごとに読む
  const hiddenCategoryIds = useReportViewStore((state) => state.hiddenCategoryIds);
  const uncategorizedHidden = useReportViewStore((state) => state.uncategorizedHidden);
  const marginHidden = useReportViewStore((state) => state.marginHidden);
  const segmentId = useReportViewStore((state) => state.segmentId);

  // 削除済みセグメントを指したままの ID は「すべて」へ縮退する
  const activeSegment = useMemo(
    () => segments?.find((segment) => segment.id === segmentId) ?? null,
    [segments, segmentId],
  );

  const view = useMemo(() => {
    if (!data) return null;

    const filter: ReportFilterState = { hiddenCategoryIds, uncategorizedHidden, marginHidden };
    const visible = resolveVisibleActivities(data.activities, filter);
    const lensed = applySegmentLens(visible, activeSegment?.activityIds ?? null);

    // レンズ中は余白を分母に入れない。セグメント内の記録合計が 100% になる（仕様 §2.4）
    const marginVisible = !marginHidden && activeSegment === null;

    const denominators = computeDenominators({
      // ここにフィルタを掛けてはいけない。掛けると余白がフィルタで動く（仕様 §13-2）
      allActivities: data.activities,
      visibleActivities: lensed,
      lengthMinutes: data.period.lengthMinutes,
      marginVisible,
    });
    const inkColumns = buildInkColumns(lensed, data.period.bucketKeys);

    return {
      denominators,
      marginVisible,
      inkColumns,
      maxInkMinutes: maxInkColumnMinutes(inkColumns),
      slices: buildAllocationSlices(
        lensed,
        denominators.trackMinutes,
        activeSegment === null ? 'category' : 'activity',
      ),
      // レンズ中はブロックごと描かない（選択中 100% / 他 ~0% は読み違いを生む）。
      // 計算はレンズ前の集合で行う — レンズ後だと選択中のセグメントしか値を持たない
      segmentBars:
        activeSegment === null
          ? buildSegmentBars(visible, segments ?? [], denominators.trackMinutes)
          : [],
      uncategorizedPercent: computeUncategorizedPercent(lensed, denominators.visibleMinutes),
      previousDeltaMinutes: computePreviousDelta({
        visibleMinutes: denominators.visibleMinutes,
        previousActivities: data.previousActivities,
        visibleActivityIds: new Set(lensed.map((activity) => activity.activityId)),
      }),
    };
  }, [data, segments, activeSegment, hiddenCategoryIds, uncategorizedHidden, marginHidden]);

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
        marginVisible={view.marginVisible}
        activeSegmentName={activeSegment?.name ?? null}
      />
    </div>
  );
}
