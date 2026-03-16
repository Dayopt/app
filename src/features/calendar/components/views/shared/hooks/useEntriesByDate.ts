/**
 * プラン日付グループ化統一フック
 */

import { useMemo } from 'react';

import { isSameDay } from 'date-fns';

import { getDateKey } from '@/lib/date';
import type { CalendarEvent } from '../types/base.types';
import { isValidEvent } from '../utils/dateHelpers';
import { sortAgendaEventsByDateKeys, sortEventsByDateKeys } from '../utils/planSorting';

export interface UsePlansByDateOptions {
  dates: Date[];
  plans: CalendarEvent[];
  sortType?: 'standard' | 'agenda';
}

export interface UsePlansByDateReturn {
  plansByDate: Record<string, CalendarEvent[]>;
  totalPlans: number;
  hasPlans: boolean;
}

/**
 * プランを日付ごとにグループ化する統一フック
 *
 * @description
 * 以前は各ビューで80-90行の重複ロジックがあったが、これで統一
 * - WeekView, ThreeDayView, FiveDayView で共通使用
 * - マルチデイプラン対応
 * - 無効プランの自動フィルタリング
 * - 時刻ソート
 */
export function usePlansByDate({
  dates,
  plans = [],
  sortType = 'standard',
}: UsePlansByDateOptions): UsePlansByDateReturn {
  const plansByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};

    // Step 1: 各日付のキーを初期化
    dates.forEach((date) => {
      const dateKey = getDateKey(date);
      grouped[dateKey] = [];
    });

    // Step 2: プランを適切な日付に配置
    plans.forEach((plan) => {
      if (!isValidEvent(plan)) {
        return;
      }

      // startDateがnullまたはundefinedの場合はスキップ
      if (!plan.startDate) {
        return;
      }

      // より柔軟な日付正規化
      const planStart = plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate);

      // 無効な日付は除外
      if (isNaN(planStart.getTime())) {
        return;
      }

      // マルチデイプランの場合は複数日にまたがって表示
      if (plan.isMultiDay && plan.endDate) {
        const planEnd = plan.endDate instanceof Date ? plan.endDate : new Date(plan.endDate);

        if (!isNaN(planEnd.getTime())) {
          // 期間内の日付のみ処理
          dates.forEach((date) => {
            if (date >= planStart && date <= planEnd) {
              const dateKey = getDateKey(date);
              if (grouped[dateKey]) {
                grouped[dateKey].push(plan);
              }
            }
          });
          return;
        }
      }

      // 単日プランの場合
      dates.forEach((date) => {
        if (isSameDay(planStart, date)) {
          const dateKey = getDateKey(date);
          if (grouped[dateKey]) {
            grouped[dateKey].push(plan);
          }
        }
      });
    });

    // Step 3: 各日のプランを適切にソート
    const sortedResult =
      sortType === 'agenda' ? sortAgendaEventsByDateKeys(grouped) : sortEventsByDateKeys(grouped);

    return sortedResult;
  }, [dates, plans, sortType]);

  // 統計情報も提供
  const totalPlans = useMemo(() => {
    return Object.values(plansByDate).reduce((total, dayPlans) => total + dayPlans.length, 0);
  }, [plansByDate]);

  const hasPlans = totalPlans > 0;

  return {
    plansByDate,
    totalPlans,
    hasPlans,
  };
}
