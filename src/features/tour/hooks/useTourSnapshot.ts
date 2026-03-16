'use client';

import { useMemo } from 'react';

import { useTourStore } from '../stores/useTourStore';

import type { TourSnapshot } from '../types';

/**
 * ストアから派生状態を計算するフック
 *
 * コンポーネントはこのスナップショットだけを参照すればよい。
 */
export function useTourSnapshot(): TourSnapshot {
  const machine = useTourStore.use.machine();

  return useMemo((): TourSnapshot => {
    const { status, stepIndex, steps } = machine;
    const currentStep = steps[stepIndex] ?? null;
    const totalSteps = steps.length;
    const canGoBack = status === 'active' && stepIndex > 0;
    const isLastStep = stepIndex === totalSteps - 1;

    return {
      status,
      currentStep,
      stepIndex,
      totalSteps,
      canGoBack,
      isLastStep,
    };
  }, [machine]);
}
