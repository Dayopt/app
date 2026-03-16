import type { TourEvent, TourStatus, TourStepDef } from '../types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface TourMachineState {
  status: TourStatus;
  stepIndex: number;
  steps: TourStepDef[];
  completed: boolean;
}

export function createInitialState(steps: TourStepDef[], completed: boolean): TourMachineState {
  return {
    status: completed ? 'completed' : 'idle',
    stepIndex: 0,
    steps,
    completed,
  };
}

// ---------------------------------------------------------------------------
// Pure transition function
// ---------------------------------------------------------------------------

/**
 * 純粋な状態遷移関数。React に依存しない。
 *
 * (state, event) => state のシグネチャで、
 * 全 status×event の組み合わせをテストで網羅できる。
 */
export function transition(state: TourMachineState, event: TourEvent): TourMachineState {
  switch (state.status) {
    case 'idle': {
      if (event.type === 'START' && !state.completed) {
        const step = state.steps[0];
        if (!step) {
          return { ...state, status: 'done' };
        }
        return {
          ...state,
          status: step.beforeEnter ? 'before-enter' : 'active',
          stepIndex: 0,
        };
      }
      if (event.type === 'RESET') {
        return { ...state, status: 'idle', completed: false, stepIndex: 0 };
      }
      return state;
    }

    case 'before-enter': {
      if (
        event.type === 'BEFORE_ENTER_COMPLETE' &&
        event.stepId === state.steps[state.stepIndex]?.id
      ) {
        return { ...state, status: 'active' };
      }
      if (event.type === 'SKIP') {
        return { ...state, status: 'completed', completed: true, stepIndex: 0 };
      }
      return state;
    }

    case 'active': {
      if (event.type === 'NEXT') {
        const nextIndex = state.stepIndex + 1;
        if (nextIndex >= state.steps.length) {
          return { ...state, status: 'done', stepIndex: nextIndex };
        }
        const nextStep = state.steps[nextIndex];
        return {
          ...state,
          stepIndex: nextIndex,
          status: nextStep?.beforeEnter ? 'before-enter' : 'active',
        };
      }
      if (event.type === 'PREV' && state.stepIndex > 0) {
        return { ...state, stepIndex: state.stepIndex - 1 };
        // status は 'active' 維持（戻り時は beforeEnter 不要）
      }
      if (event.type === 'SKIP') {
        return { ...state, status: 'completed', completed: true, stepIndex: 0 };
      }
      return state;
    }

    case 'done': {
      if (event.type === 'COMPLETE') {
        return { ...state, status: 'completed', completed: true, stepIndex: 0 };
      }
      return state;
    }

    case 'completed': {
      if (event.type === 'RESET') {
        return { ...state, status: 'idle', completed: false, stepIndex: 0 };
      }
      return state;
    }
  }
}
