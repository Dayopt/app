'use client';

import React, { Suspense, useMemo } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';

import type { CalendarViewType } from '../../../types/calendar.types';
import { getMultiDayCount, isMultiDayView } from '../../../types/calendar.types';
import type { GridViewProps } from '../../views/shared/types/base.types';

import { CalendarViewSkeleton } from './CalendarViewSkeleton';

// 遅延ロード: カレンダービューコンポーネントは大きいため、使用時のみロード（絶対パスで指定）
// LCP改善: 個別にSuspenseをネストし、必要なビューのみロード
const DayView = React.lazy(() =>
  import('@/features/calendar/components/views/DayView').then((module) => ({
    default: module.DayView,
  })),
);
const WeekView = React.lazy(() =>
  import('@/features/calendar/components/views/WeekView').then((module) => ({
    default: module.WeekView,
  })),
);
const MultiDayView = React.lazy(() =>
  import('@/features/calendar/components/views/MultiDayView').then((module) => ({
    default: module.MultiDayView,
  })),
);
/** モバイルでWeekViewを表示すると7列で狭すぎるため、3-dayにフォールバック */
const MOBILE_WEEK_FALLBACK_DAYS = 3;

interface CalendarViewRendererProps {
  viewType: CalendarViewType;
  /** GridViewPropsを渡す（showWeekendsは含まれる） */
  commonProps: GridViewProps;
}

/**
 * CalendarViewRenderer - ビューレンダリング専用コンポーネント
 *
 * LCP改善: 各ビューを個別のSuspenseでラップし、選択されたビューのみロード
 * memo化により、propsが変更されない限り再レンダリングをスキップ
 * これにより、親コンポーネントの他の状態変更時の不要な再描画を防止
 */
export const CalendarViewRenderer = React.memo(function CalendarViewRenderer({
  viewType,
  commonProps,
}: CalendarViewRendererProps) {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  // LCP改善: ビューをメモ化して不要な再生成を防止
  const viewContent = useMemo(() => {
    if (isMultiDayView(viewType)) {
      return (
        <Suspense fallback={<CalendarViewSkeleton />}>
          <MultiDayView dayCount={getMultiDayCount(viewType)} {...commonProps} />
        </Suspense>
      );
    }

    switch (viewType) {
      case 'day':
        return (
          <Suspense fallback={<CalendarViewSkeleton />}>
            <DayView {...commonProps} />
          </Suspense>
        );
      case 'week':
        // モバイル（< 640px）では7列が狭すぎるため3-dayビューにフォールバック
        if (isMobile) {
          return (
            <Suspense fallback={<CalendarViewSkeleton />}>
              <MultiDayView dayCount={MOBILE_WEEK_FALLBACK_DAYS} {...commonProps} />
            </Suspense>
          );
        }
        return (
          <Suspense fallback={<CalendarViewSkeleton />}>
            <WeekView {...commonProps} />
          </Suspense>
        );
      default:
        return (
          <Suspense fallback={<CalendarViewSkeleton />}>
            <DayView {...commonProps} />
          </Suspense>
        );
    }
  }, [viewType, commonProps, isMobile]);

  // 各ビューが個別にSuspenseでラップ済みのため、外側の二重Suspenseは不要（CLS回避）
  return viewContent;
});
