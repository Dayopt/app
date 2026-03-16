import { useMemo } from 'react';

import { isSameDay, isValid } from 'date-fns';

import { applyTimezoneToDisplayDates } from '../../../../lib/plan-data-adapter';
import type { CalendarEvent } from '../../../../types/calendar.types';

import { HOUR_HEIGHT } from '../constants/grid.constants';

import { usePlanLayoutCalculator, type PlanLayout } from './usePlanLayoutCalculator';

const PLAN_PADDING = 2; // プラン間のパディング
const MIN_PLAN_HEIGHT = 20; // 最小プラン高さ

interface UseViewPlansOptions {
  date: Date;
  plans: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

export interface PlanPosition {
  plan: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  column: number;
  totalColumns: number;
  opacity?: number;
}

interface UseViewPlansReturn {
  dayPlans: CalendarEvent[];
  planPositions: PlanPosition[];
  maxConcurrentPlans: number;
  skippedPlansCount: number;
}

/**
 * 汎用的なビュープラン処理フック
 * DayView, WeekView等で共通利用可能
 */
export function useViewPlans({
  date,
  plans = [],
  hourHeight = HOUR_HEIGHT,
  timezone,
}: UseViewPlansOptions): UseViewPlansReturn {
  // TZ変換を適用（Planのみ、Recordは変換しない）
  const tzPlans = useMemo(
    () => plans.map((p) => applyTimezoneToDisplayDates(p, timezone)),
    [plans, timezone],
  );

  // 指定日のプランのみフィルター（displayStartDateで判定）
  const dayPlans = useMemo(() => {
    if (!tzPlans || !Array.isArray(tzPlans)) {
      return [];
    }
    return tzPlans.filter((plan) => {
      if (!plan.displayStartDate || !isValid(new Date(plan.displayStartDate))) {
        return false;
      }

      return isSameDay(plan.displayStartDate, date);
    });
  }, [date, tzPlans]);

  // CalendarEventをusePlanLayoutCalculatorで期待される形式に変換
  // displayStartDate/displayEndDateを使用してTZ対応の位置計算を実現
  const convertedPlans = useMemo(() => {
    return dayPlans.map((plan) => ({
      ...plan,
      start: plan.displayStartDate,
      end: plan.displayEndDate || new Date(plan.displayStartDate.getTime() + 60 * 60 * 1000),
    }));
  }, [dayPlans]);

  // 新しいレイアウト計算システムを使用
  const planLayouts = usePlanLayoutCalculator(convertedPlans);

  // レイアウト情報をPlanPositionに変換
  const planPositions = useMemo((): PlanPosition[] => {
    return planLayouts.map((layout: PlanLayout, index: number) => {
      const startDate = new Date(layout.plan.start);
      const endDate = new Date(layout.plan.end);

      const startHour = startDate.getHours() + startDate.getMinutes() / 60;
      const endHour = endDate.getHours() + endDate.getMinutes() / 60;
      const duration = Math.max(endHour - startHour, 0.25); // 最小15分

      // 位置計算
      const top = startHour * hourHeight;
      const height = Math.max(duration * hourHeight - PLAN_PADDING, MIN_PLAN_HEIGHT);

      return {
        plan: layout.plan as CalendarEvent,
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
  }, [planLayouts, hourHeight]);

  const maxConcurrentPlans = useMemo(() => {
    return Math.max(1, ...planLayouts.map((layout: PlanLayout) => layout.totalColumns));
  }, [planLayouts]);

  return {
    dayPlans,
    planPositions,
    maxConcurrentPlans,
    skippedPlansCount: 0, // 新しいシステムではスキップしない
  };
}
