import { useCallback, useEffect, useRef } from 'react';

import { addDays, isWeekend } from 'date-fns';

import type { CalendarViewType } from '../types/calendar.types';

interface UseWeekendNavigationProps {
  viewType: CalendarViewType;
  currentDate: Date;
  showWeekends: boolean;
  navigateToDate: (date: Date) => void;
}

/**
 * 週末スキップナビゲーション機能を提供するフック
 *
 * advanced-use-latest パターンを使用して useCallback 参照を安定化
 */
export function useWeekendNavigation({
  viewType,
  currentDate,
  showWeekends,
  navigateToDate,
}: UseWeekendNavigationProps) {
  // 最新の値を useRef で保持（コールバック参照の安定化）
  const latestRef = useRef({ viewType, currentDate, showWeekends, navigateToDate });

  useEffect(() => {
    latestRef.current = { viewType, currentDate, showWeekends, navigateToDate };
  });

  /**
   * 週末を考慮して日付を調整
   */
  const adjustWeekendDate = useCallback((date: Date): Date => {
    const { showWeekends: sw, viewType: vt } = latestRef.current;

    if (sw || vt !== 'day') {
      return date;
    }

    // 日ビューで週末非表示の場合、週末をスキップ
    let adjustedDate = date;
    while (isWeekend(adjustedDate)) {
      adjustedDate = addDays(adjustedDate, 1);
    }

    return adjustedDate;
  }, []);

  /**
   * Todayボタン押下時の週末スキップ処理
   */
  const handleTodayWithWeekendSkip = useCallback((): boolean => {
    const { showWeekends: sw, viewType: vt, navigateToDate: nav } = latestRef.current;

    if (!sw && vt === 'day') {
      const today = new Date();
      if (isWeekend(today)) {
        // 週末の場合は次の平日に移動
        const nextWeekday = adjustWeekendDate(today);
        nav(nextWeekday);
        return true;
      }
    }
    return false;
  }, [adjustWeekendDate]);

  /**
   * prev/nextナビゲーション時の週末スキップ処理
   */
  const handleWeekendSkipNavigation = useCallback((direction: 'prev' | 'next'): boolean => {
    const {
      showWeekends: sw,
      viewType: vt,
      currentDate: cd,
      navigateToDate: nav,
    } = latestRef.current;

    if (!sw && vt === 'day') {
      const nextDate = direction === 'next' ? addDays(cd, 1) : addDays(cd, -1);

      if (isWeekend(nextDate)) {
        // 週末の場合はスキップ
        const daysToSkip =
          direction === 'next'
            ? nextDate.getDay() === 6
              ? 2
              : 1
            : nextDate.getDay() === 0
              ? -2
              : -1;

        const skipDate = addDays(nextDate, daysToSkip);
        nav(skipDate);
        return true;
      }
    }
    return false;
  }, []);

  return {
    handleTodayWithWeekendSkip,
    handleWeekendSkipNavigation,
    adjustWeekendDate,
  };
}
