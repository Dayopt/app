'use client';

import React, { Suspense, useMemo } from 'react';

import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

import type { GridViewProps } from '../../../types/base.types';
import type { CalendarViewType } from '../../../types/calendar.types';
import { getMultiDayCount, isMultiDayView } from '../../../types/calendar.types';

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
/** モバイルでは列数が多すぎると狭くなるため、最大3日にフォールバック */
const MOBILE_MAX_DAYS = 3;
/** タブレット（サイドバー込み512px幅）では5日まで */
const TABLET_MAX_DAYS = 5;

/** CalendarViewRenderer コンポーネントのプロパティ */
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
  const isTablet = useMediaQuery(MEDIA_QUERIES.tablet);

  // LCP改善: ビューをメモ化して不要な再生成を防止
  const viewContent = useMemo(() => {
    // デバイス別の最大列数を決定
    const maxDays = isMobile ? MOBILE_MAX_DAYS : isTablet ? TABLET_MAX_DAYS : Infinity;

    if (isMultiDayView(viewType)) {
      const requestedDays = getMultiDayCount(viewType);
      const dayCount = Math.min(requestedDays, maxDays);
      return (
        <Suspense fallback={<CalendarViewSkeleton />}>
          <MultiDayView dayCount={dayCount} {...commonProps} />
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
        // モバイルは CalendarNavigationContext が viewType を 'day' に強制するため、
        // 収束先と同じ DayView を直接返す（MultiDayView を経由すると2段階で切り替わりちらつく）
        if (isMobile) {
          return (
            <Suspense fallback={<CalendarViewSkeleton />}>
              <DayView {...commonProps} />
            </Suspense>
          );
        }
        // タブレットでは7列が狭すぎるためMultiDayViewにフォールバック
        if (isTablet) {
          return (
            <Suspense fallback={<CalendarViewSkeleton />}>
              <MultiDayView dayCount={maxDays} {...commonProps} />
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
  }, [viewType, commonProps, isMobile, isTablet]);

  // 各ビューが個別にSuspenseでラップ済みのため、外側の二重Suspenseは不要（CLS回避）
  return viewContent;
});
