import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import { computePlanStyles } from '../../../../engine/grid';

import type { PlanPosition } from './useViewPlans';

/**
 * プラン位置情報からCSSスタイルを計算するフック
 * engine/grid.ts の computePlanStyles の React ラッパー
 */
export function usePlanStyles(planPositions: PlanPosition[]): Record<string, CSSProperties> {
  return useMemo((): Record<string, CSSProperties> => {
    const inputs = planPositions
      .filter((p) => p.plan?.id)
      .map(({ plan, top, height, left, width, zIndex, opacity }) => ({
        id: plan.id,
        top,
        height,
        left,
        width,
        zIndex,
        ...(opacity != null ? { opacity } : {}),
      }));

    return computePlanStyles(inputs);
  }, [planPositions]);
}
