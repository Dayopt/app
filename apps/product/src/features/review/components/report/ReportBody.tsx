'use client';

import { BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { Skeleton } from '@dayopt/components';

import { deriveAccuracy, deriveBarComparison, deriveStatement } from '../../domain/timePL/derivers';
import { useReviewOpenedTracking } from '../../hooks/useReviewOpenedTracking';
import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useTimePLData } from '../../hooks/useTimePLData';
import type { ReviewDisplayRange } from '../../lib/compute-date-range';
import { ReviewDiffPanel, type ReviewDiffResult } from '../diff/ReviewDiffPanel';
import { WeeklyReflectionPanel } from '../reflection/WeeklyReflectionPanel';

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
 * セクションは固定 2 つ（v1、セグメントは Step 5 で追加）:
 * 1. 差分 — 今日/今週の予定と実績のズレ
 * 2. 予実の傾向（Time P/L）
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
