/**
 * プラン配置計算フック
 */

import { useMemo } from 'react';

import type { EntryCardPosition } from '@/features/entry';
import { HOUR_HEIGHT } from '../constants/grid.constants';
import type { TimedPlan } from '../types/plan.types';

import { usePlanLayoutCalculator } from './usePlanLayoutCalculator';

export interface UsePlanPositionOptions {
  hourHeight?: number;
}

export interface PositionedPlan extends TimedPlan {
  position: EntryCardPosition;
}

export function usePlanPosition(plans: TimedPlan[], options: UsePlanPositionOptions = {}) {
  const { hourHeight = HOUR_HEIGHT } = options;

  // usePlanLayoutCalculator で列配置を計算
  const layouts = usePlanLayoutCalculator(plans);

  const planPositions = useMemo(() => {
    const positions = new Map<string, EntryCardPosition>();

    if (layouts.length === 0) return positions;

    // 各プランの位置を計算
    layouts.forEach((layout) => {
      const { plan, width, left } = layout;

      // 時刻からピクセル位置を計算
      const startMinutes = plan.start.getHours() * 60 + plan.start.getMinutes();
      const endMinutes = plan.end.getHours() * 60 + plan.end.getMinutes();
      const top = (startMinutes * hourHeight) / 60;
      const height = Math.max(((endMinutes - startMinutes) * hourHeight) / 60, 20);

      positions.set(plan.id, {
        top,
        left,
        width,
        height,
        zIndex: 10,
      });
    });

    return positions;
  }, [layouts, hourHeight]);

  return planPositions;
}

/**
 * プランと位置を結合して配置済みプランを返すフック
 */
export function usePositionedPlans(
  plans: TimedPlan[],
  options: UsePlanPositionOptions = {},
): PositionedPlan[] {
  const positions = usePlanPosition(plans, options);

  return useMemo(() => {
    return plans.map((plan) => ({
      ...plan,
      position: positions.get(plan.id) || {
        top: 0,
        left: 0,
        width: 100,
        height: 20,
        zIndex: 10,
      },
    }));
  }, [plans, positions]);
}
