import { useMemo } from 'react';

import { format, isSameDay, isValid } from 'date-fns';

import { applyTimezoneToDisplayDates } from '../../../../lib/plan-data-adapter';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { HOUR_HEIGHT as DEFAULT_HOUR_HEIGHT } from '../constants/grid.constants';

import { usePlanLayoutCalculator, type PlanLayout } from './usePlanLayoutCalculator';
import type { PlanPosition } from './useViewPlans';

const PLAN_PADDING = 2; // プラン間のパディング
const MIN_PLAN_HEIGHT = 20; // 最小プラン高さ

interface UseMultiDayPlanPositionsOptions {
  displayDates: Date[];
  plans: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

interface UseMultiDayPlanPositionsReturn {
  planPositions: PlanPosition[];
  plansByDate: Map<string, CalendarEvent[]>;
}

/**
 * 複数日表示用のプラン位置計算フック
 * MultiDayView(3day/5day等)で共通利用
 *
 * usePlanLayoutCalculatorを使用して重複プランの
 * カラム配置を正しく計算
 */
export function useMultiDayPlanPositions({
  displayDates,
  plans,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  timezone,
}: UseMultiDayPlanPositionsOptions): UseMultiDayPlanPositionsReturn {
  // TZ変換を適用（Planのみ、Recordは変換しない）
  const tzPlans = useMemo(
    () => plans.map((p) => applyTimezoneToDisplayDates(p, timezone)),
    [plans, timezone],
  );

  // 日付別にプランをグループ化（displayStartDateで判定）
  const plansByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();

    displayDates.forEach((date) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const dayPlans = tzPlans.filter((plan) => {
        if (!plan.displayStartDate || !isValid(new Date(plan.displayStartDate))) {
          return false;
        }
        return isSameDay(plan.displayStartDate, date);
      });
      grouped.set(dateKey, dayPlans);
    });

    return grouped;
  }, [displayDates, tzPlans]);

  // 全日付のプランをTimedPlan形式に変換（usePlanLayoutCalculator用）
  // displayStartDate/displayEndDateを使用してTZ対応の位置計算を実現
  const allConvertedPlans = useMemo(() => {
    const converted: Array<{
      dateKey: string;
      plan: CalendarEvent;
      start: Date;
      end: Date;
      id: string;
    }> = [];

    plansByDate.forEach((dayPlans, dateKey) => {
      dayPlans.forEach((plan) => {
        converted.push({
          dateKey,
          plan,
          start: plan.displayStartDate,
          end: plan.displayEndDate || new Date(plan.displayStartDate.getTime() + 60 * 60 * 1000),
          id: plan.id,
        });
      });
    });

    return converted;
  }, [plansByDate]);

  // 日付ごとにレイアウト計算
  // usePlanLayoutCalculatorはフックなので、日付ごとに呼べない
  // 代わりに全プランを一度に渡し、後で日付ごとに分離
  const planLayouts = usePlanLayoutCalculator(
    allConvertedPlans.map((p) => ({
      ...p.plan,
      start: p.start,
      end: p.end,
      id: p.id,
    })),
  );

  // レイアウト情報をPlanPositionに変換
  const planPositions = useMemo((): PlanPosition[] => {
    return planLayouts.map((layout: PlanLayout, index: number) => {
      const originalPlan = allConvertedPlans.find((p) => p.id === layout.plan.id);
      const plan = originalPlan?.plan || (layout.plan as CalendarEvent);

      const startDate = new Date(layout.plan.start);
      const endDate = new Date(layout.plan.end);

      const startHour = startDate.getHours() + startDate.getMinutes() / 60;
      const endHour = endDate.getHours() + endDate.getMinutes() / 60;
      const duration = Math.max(endHour - startHour, 0.25); // 最小15分

      // 位置計算
      const top = startHour * hourHeight;
      const height = Math.max(duration * hourHeight - PLAN_PADDING, MIN_PLAN_HEIGHT);

      return {
        plan,
        top,
        height,
        left: layout.left,
        width: layout.width,
        zIndex: 10 + index,
        column: layout.column,
        totalColumns: layout.totalColumns,
        opacity: layout.totalColumns > 1 ? 0.95 : 1.0,
      };
    });
  }, [planLayouts, allConvertedPlans, hourHeight]);

  return {
    planPositions,
    plansByDate,
  };
}
