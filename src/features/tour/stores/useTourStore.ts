'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

import { TOUR_STEPS } from '../constants';
import { createInitialState, transition } from '../machine/tourMachine';

import type { TourMachineState } from '../machine/tourMachine';
import type { TourEvent } from '../types';

// ---------------------------------------------------------------------------
// skipWhen フィルタ
// ---------------------------------------------------------------------------

/** ランタイム条件でステップをフィルタ */
function resolveActiveSteps() {
  return TOUR_STEPS.filter((step) => !step.skipWhen?.());
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface TourStoreState {
  /** ステートマシンの状態 */
  machine: TourMachineState;
  /** イベント送信 */
  send: (event: TourEvent) => void;
}

const useTourStoreBase = create<TourStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        machine: createInitialState([], false),

        send: (event: TourEvent) => {
          const current = get().machine;

          // START 時にステップを解決（skipWhen を評価）
          if (event.type === 'START') {
            const activeSteps = resolveActiveSteps();
            const fresh = createInitialState(activeSteps, current.completed);
            const next = transition(fresh, event);
            set({ machine: next });
            return;
          }

          // RESET 時もステップを再解決
          if (event.type === 'RESET') {
            const activeSteps = resolveActiveSteps();
            const next = transition(current, event);
            set({ machine: { ...next, steps: activeSteps } });
            return;
          }

          const next = transition(current, event);
          set({ machine: next });
        },
      }),
      {
        name: 'tour-storage',
        partialize: (state) => ({
          // completed のみ永続化
          machine: {
            status: state.machine.completed ? ('completed' as const) : ('idle' as const),
            stepIndex: 0,
            steps: [],
            completed: state.machine.completed,
          },
        }),
      },
    ),
    { name: 'tour-store' },
  ),
);

export const useTourStore = createSelectors(useTourStoreBase);
