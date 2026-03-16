import { useMemo } from 'react';

import { calculatePlanLayouts } from '../../../../engine/layout';
import type { TimedPlan } from '../types/plan.types';

// Re-export PlanLayout type for consumers
export type { PlanLayout } from '../../../../engine/layout';

/**
 * プランの重複レイアウト計算フック
 * Googleカレンダー風の横並び配置を実現
 *
 * 純粋ロジックは engine/layout.ts に委譲。
 * このフックは useMemo ラッパーのみ。
 */
export function usePlanLayoutCalculator(plans: TimedPlan[]) {
  return useMemo(() => calculatePlanLayouts(plans), [plans]);
}
