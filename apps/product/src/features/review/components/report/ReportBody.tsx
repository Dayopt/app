'use client';

import { BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { formatDurationMinutes } from '@/lib/date';
import { cn, Skeleton } from '@dayopt/components';

import { deriveAccuracy, deriveBarComparison, deriveStatement } from '../../domain/timePL/derivers';
import { useReviewOpenedTracking } from '../../hooks/useReviewOpenedTracking';
import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useSegments } from '../../hooks/useSegments';
import { useSegmentTotals } from '../../hooks/useSegmentTotals';
import { useTimePLData } from '../../hooks/useTimePLData';
import type { ReviewDisplayRange } from '../../lib/compute-date-range';
import { ReviewDiffPanel, type ReviewDiffResult } from '../diff/ReviewDiffPanel';
import { WeeklyReflectionPanel } from '../reflection/WeeklyReflectionPanel';
import { formatVariance, getVarianceColor } from '../time-pl/data/timePL.presentation';

export interface ReportDiffState {
  data: ReviewDiffResult | null;
  isPending: boolean;
  isError: boolean;
}

interface ReportBodyProps {
  currentDate: Date;
  displayRange: ReviewDisplayRange;
  /**
   * 差分（セクション1）は Composition Layer が timeblock を取得して計算する
   * （features/review → features/calendar は同層 import 禁止のため。
   * overview.md §6-9 #D）。review 自身は props で受け取るだけ。
   */
  diff: ReportDiffState;
  onDiffItemClick?: ((timeblockId: string) => void) | undefined;
}

/**
 * `/report` の本体（1 スクロール構成、overview.md §6-1）。
 *
 * セクションは固定 3 つ（v1、overview.md §6-1）:
 * 1. 差分 — 今日/今週の予定と実績のズレ
 * 2. 予実の傾向（Time P/L）
 * 3. セグメント（#2181 Step 5）— 単体の数字 + 直前期間比較のみ。円グラフ・積み上げ・
 *    合計/比率は出さない（#2162 §6-3 の表示規律）
 *
 * セクションごとに独立した loading/error を持つ（overview.md §6-9 #2）。
 * 片方が失敗しても他方は描画され続ける。
 */
export function ReportBody({ currentDate, displayRange, diff, onDiffItemClick }: ReportBodyProps) {
  // /report がマウントされている間 = review が開いている、とみなす（旧パネルの
  // isActive 相当。CalendarReviewRail の廃止に伴いここへ移設）。
  useReviewOpenedTracking(true);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <ReportDiffSection diff={diff} onItemClick={onDiffItemClick} />
      <ReportTrendSection currentDate={currentDate} displayRange={displayRange} />
      <ReportSegmentSection displayRange={displayRange} />
    </div>
  );
}

function ReportDiffSection({
  diff,
  onItemClick,
}: {
  diff: ReportDiffState;
  onItemClick?: ((timeblockId: string) => void) | undefined;
}) {
  const t = useTranslations('calendar.compare.rail');

  if (diff.isError) {
    return (
      <SectionShell>
        <ErrorState title={t('title')} description={t('emptyDescription')} />
      </SectionShell>
    );
  }

  if (diff.isPending || !diff.data) {
    return (
      <SectionShell>
        <SectionSkeleton />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <ReviewDiffPanel diff={diff.data} {...(onItemClick ? { onItemClick } : {})} />
    </SectionShell>
  );
}

function ReportTrendSection({
  currentDate,
  displayRange,
}: {
  currentDate: Date;
  displayRange: ReviewDisplayRange;
}) {
  const t = useTranslations('calendar.stats');
  const { data: pageData, isPending, isError } = useReviewPageData(displayRange, currentDate);
  const {
    data: timePLData,
    isPending: isTimePLPending,
    isError: isTimePLError,
  } = useTimePLData(displayRange);

  const statement = useMemo(() => (timePLData ? deriveStatement(timePLData) : null), [timePLData]);
  const accuracy = useMemo(() => (timePLData ? deriveAccuracy(timePLData) : null), [timePLData]);
  const barRows = useMemo(() => (timePLData ? deriveBarComparison(timePLData) : []), [timePLData]);

  const isLoading = isPending || isTimePLPending;
  const hasError = isError || isTimePLError;
  const trackedMinutes = pageData?.overview.totalMinutes ?? statement?.actualTotal ?? 0;

  if (hasError) {
    return (
      <SectionShell title={t('review.timePLTitle')}>
        <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
      </SectionShell>
    );
  }

  if (isLoading) {
    return (
      <SectionShell title={t('review.timePLTitle')}>
        <SectionSkeleton />
      </SectionShell>
    );
  }

  if (!timePLData && !pageData) {
    return (
      <SectionShell title={t('review.timePLTitle')}>
        <EmptyState
          icon={BarChart3}
          title={t('review.emptyTitle')}
          description={t('review.emptyDescription')}
          size="sm"
          centered
        />
      </SectionShell>
    );
  }

  return (
    <SectionShell title={t('review.timePLTitle')}>
      <WeeklyReflectionPanel
        trackedMinutes={trackedMinutes}
        planAccuracyRate={accuracy?.rate ?? null}
        plannedMinutes={statement?.budgetTotal ?? 0}
        diffMinutes={statement?.netVarianceMinutes ?? 0}
        timePLRows={barRows}
        estimationRows={pageData?.estimationAccuracy}
        blankSummary={pageData?.blankRate ?? null}
      />
    </SectionShell>
  );
}

function ReportSegmentSection({ displayRange }: { displayRange: ReviewDisplayRange }) {
  const t = useTranslations('calendar.stats.review.segments');
  const { data: segments, isPending: isSegmentsPending, isError: isSegmentsError } = useSegments();
  const {
    data: totals,
    isPending: isTotalsPending,
    isError: isTotalsError,
  } = useSegmentTotals(displayRange, segments);

  const hasSegments = (segments?.length ?? 0) > 0;
  const isLoading = isSegmentsPending || (hasSegments && isTotalsPending);
  const hasError = isSegmentsError || (hasSegments && isTotalsError);

  if (hasError) {
    return (
      <SectionShell title={t('title')}>
        <ErrorState title={t('title')} description="" />
      </SectionShell>
    );
  }

  if (isLoading) {
    return (
      <SectionShell title={t('title')}>
        <SectionSkeleton />
      </SectionShell>
    );
  }

  if (!hasSegments) {
    return (
      <SectionShell title={t('title')}>
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          size="sm"
          centered
        />
      </SectionShell>
    );
  }

  const prevBySegmentId = new Map((totals?.previous ?? []).map((row) => [row.segmentId, row]));

  return (
    <SectionShell title={t('title')}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {(totals?.current ?? []).map((row) => {
          const prev = prevBySegmentId.get(row.segmentId);
          const deltaMinutes = prev ? row.actualMinutes - prev.actualMinutes : null;
          return (
            <div key={row.segmentId} className="border-border-subtle rounded-lg border p-3">
              <p className="text-muted-foreground truncate text-xs">{row.segmentName}</p>
              <p className="text-foreground mt-2 text-lg font-medium tabular-nums">
                {formatDurationMinutes(row.actualMinutes)}
              </p>
              {deltaMinutes != null && (
                <p
                  className={cn(
                    'mt-1 text-xs tabular-nums',
                    getVarianceColor(
                      prev && prev.actualMinutes > 0
                        ? (deltaMinutes / prev.actualMinutes) * 100
                        : 0,
                    ),
                  )}
                >
                  {t('vsPrevious')} {formatVariance(deltaMinutes)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function SectionShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      {title ? <h2 className="text-base font-medium">{title}</h2> : null}
      {children}
    </section>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
