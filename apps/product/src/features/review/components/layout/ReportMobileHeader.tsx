'use client';

import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/shell/AppHeader';
import { DateRangeDisplay } from '@/components/ui/display/DateRangeDisplay';
import { DateNavigator } from '@/components/ui/navigation/DateNavigator';

import type { ReportGranularity, ReportWeekStartsOn } from '../../lib/report-period';

interface ReportMobileHeaderProps {
  periodStart: Date;
  periodEnd: Date;
  granularity: ReportGranularity;
  weekStartsOn: ReportWeekStartsOn;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** カレンダーへ戻るトグルとアカウントボタン（Composition Layer が注入）。 */
  rightSlot?: React.ReactNode | undefined;
}

/**
 * `/report` のヘッダー（モバイル）。
 *
 * デスクトップ（`ReportHeader`）と**同じ器・同じ部品**で、違いは 1 つだけ:
 * **粒度切替を出さない**（仕様 §8）。狭い面に週・月・年のセグメントを置くと、
 * 期間ラベルと `‹ ›` が潰れる。
 *
 * ただし**粒度そのものは URL（`?range=`）に従う**。デスクトップで月を見て共有した
 * リンクをスマホで開いた時に、勝手に週へ丸めない（2026-09-05、User 裁可）。
 */
export function ReportMobileHeader({
  periodStart,
  periodEnd,
  granularity,
  weekStartsOn,
  onNavigate,
  rightSlot,
}: ReportMobileHeaderProps) {
  const t = useTranslations('report');

  return (
    <AppHeader rightSlot={rightSlot}>
      <div className="flex min-w-0 items-center gap-2">
        <DateRangeDisplay
          date={periodStart}
          {...(granularity === 'week' ? { endDate: periodEnd } : {})}
          weekStartsOn={weekStartsOn}
          formatPattern={granularity === 'year' ? 'yyyy' : 'MMMM yyyy'}
        />
        <DateNavigator onNavigate={onNavigate} todayLabel={t(`nav.current.${granularity}`)} />
      </div>
    </AppHeader>
  );
}
