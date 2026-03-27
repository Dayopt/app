import { describe, expect, it } from 'vitest';

import type { TourEvent, TourStepDef } from '../types';

import { createInitialState, transition } from './tourMachine';

// ---------------------------------------------------------------------------
// テスト用ステップ定義
// ---------------------------------------------------------------------------

const step1: TourStepDef = {
  id: 'intro',
  targetSelector: '',
  placement: 'center',
  titleKey: 'tour.steps.intro.title',
  descriptionKey: 'tour.steps.intro.description',
};

const step2: TourStepDef = {
  id: 'grid-drag-entry',
  targetSelector: '[data-tour-target="grid-drag"]',
  placement: 'bottom',
  titleKey: 'tour.steps.gridDragPlan.title',
  descriptionKey: 'tour.steps.gridDragPlan.description',
  autoAdvance: {
    type: 'dom-observe',
    targetSelector: '[data-tour-target="grid-drag"]',
    matchSelector: '[data-tag-palette]',
  },
};

const stepWithBeforeEnter: TourStepDef = {
  id: 'planned-vs-actual',
  targetSelector: '',
  placement: 'center',
  titleKey: 'tour.steps.planVsRecord.title',
  descriptionKey: 'tour.steps.planVsRecord.description',
  beforeEnter: { type: 'scroll-to-past', paddingHours: 3 },
};

const steps = [step1, step2, stepWithBeforeEnter];

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('tourMachine', () => {
  describe('createInitialState', () => {
    it('未完了時は idle', () => {
      const state = createInitialState(steps, false);
      expect(state.status).toBe('idle');
      expect(state.completed).toBe(false);
      expect(state.stepIndex).toBe(0);
    });

    it('完了済みは completed', () => {
      const state = createInitialState(steps, true);
      expect(state.status).toBe('completed');
      expect(state.completed).toBe(true);
    });
  });

  describe('idle', () => {
    it('START → active（beforeEnter なしの場合）', () => {
      const state = createInitialState(steps, false);
      const next = transition(state, { type: 'START' });
      expect(next.status).toBe('active');
      expect(next.stepIndex).toBe(0);
    });

    it('START → before-enter（beforeEnter ありの場合）', () => {
      const state = createInitialState([stepWithBeforeEnter], false);
      const next = transition(state, { type: 'START' });
      expect(next.status).toBe('before-enter');
      expect(next.stepIndex).toBe(0);
    });

    it('START → done（ステップが空の場合）', () => {
      const state = createInitialState([], false);
      const next = transition(state, { type: 'START' });
      expect(next.status).toBe('done');
    });

    it('START は完了済みでは無視', () => {
      const state = createInitialState(steps, true);
      // completed 状態だが idle にリセットしてテスト
      const idle = { ...state, status: 'idle' as const };
      const next = transition(idle, { type: 'START' });
      expect(next.status).toBe('idle');
    });

    it('RESET は状態をリセット', () => {
      const state = { ...createInitialState(steps, false), completed: true };
      const next = transition({ ...state, status: 'idle' }, { type: 'RESET' });
      expect(next.completed).toBe(false);
      expect(next.stepIndex).toBe(0);
    });

    it.each<TourEvent>([
      { type: 'NEXT' },
      { type: 'PREV' },
      { type: 'SKIP' },
      { type: 'COMPLETE' },
      { type: 'BEFORE_ENTER_COMPLETE', stepId: 'intro' },
    ])('idle で $type は無視', (event) => {
      const state = createInitialState(steps, false);
      const next = transition(state, event);
      expect(next).toBe(state);
    });
  });

  describe('before-enter', () => {
    it('BEFORE_ENTER_COMPLETE → active（正しい stepId）', () => {
      const state = {
        ...createInitialState([stepWithBeforeEnter, step1], false),
        status: 'before-enter' as const,
      };
      const next = transition(state, {
        type: 'BEFORE_ENTER_COMPLETE',
        stepId: 'planned-vs-actual',
      });
      expect(next.status).toBe('active');
    });

    it('BEFORE_ENTER_COMPLETE は stepId 不一致で無視', () => {
      const state = {
        ...createInitialState([stepWithBeforeEnter], false),
        status: 'before-enter' as const,
      };
      const next = transition(state, {
        type: 'BEFORE_ENTER_COMPLETE',
        stepId: 'intro',
      });
      expect(next).toBe(state);
    });

    it('SKIP → completed', () => {
      const state = {
        ...createInitialState([stepWithBeforeEnter], false),
        status: 'before-enter' as const,
      };
      const next = transition(state, { type: 'SKIP' });
      expect(next.status).toBe('completed');
      expect(next.completed).toBe(true);
    });

    it.each<TourEvent>([
      { type: 'START' },
      { type: 'NEXT' },
      { type: 'PREV' },
      { type: 'COMPLETE' },
      { type: 'RESET' },
    ])('before-enter で $type は無視', (event) => {
      const state = {
        ...createInitialState([stepWithBeforeEnter], false),
        status: 'before-enter' as const,
      };
      const next = transition(state, event);
      expect(next).toBe(state);
    });
  });

  describe('active', () => {
    it('NEXT → 次のステップ（beforeEnter なし）', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
        stepIndex: 0,
      };
      const next = transition(state, { type: 'NEXT' });
      expect(next.status).toBe('active');
      expect(next.stepIndex).toBe(1);
    });

    it('NEXT → before-enter（次ステップに beforeEnter あり）', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
        stepIndex: 1, // step2 → stepWithBeforeEnter
      };
      const next = transition(state, { type: 'NEXT' });
      expect(next.status).toBe('before-enter');
      expect(next.stepIndex).toBe(2);
    });

    it('NEXT → done（最後のステップ）', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
        stepIndex: steps.length - 1,
      };
      const next = transition(state, { type: 'NEXT' });
      expect(next.status).toBe('done');
      expect(next.stepIndex).toBe(steps.length);
    });

    it('PREV → 前のステップに戻る', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
        stepIndex: 2,
      };
      const next = transition(state, { type: 'PREV' });
      expect(next.status).toBe('active');
      expect(next.stepIndex).toBe(1);
    });

    it('PREV は最初のステップでは無視', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
        stepIndex: 0,
      };
      const next = transition(state, { type: 'PREV' });
      expect(next).toBe(state);
    });

    it('SKIP → completed', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
        stepIndex: 1,
      };
      const next = transition(state, { type: 'SKIP' });
      expect(next.status).toBe('completed');
      expect(next.completed).toBe(true);
      expect(next.stepIndex).toBe(0);
    });

    it.each<TourEvent>([
      { type: 'START' },
      { type: 'COMPLETE' },
      { type: 'RESET' },
      { type: 'BEFORE_ENTER_COMPLETE', stepId: 'intro' },
    ])('active で $type は無視', (event) => {
      const state = {
        ...createInitialState(steps, false),
        status: 'active' as const,
      };
      const next = transition(state, event);
      expect(next).toBe(state);
    });
  });

  describe('done', () => {
    it('COMPLETE → completed', () => {
      const state = {
        ...createInitialState(steps, false),
        status: 'done' as const,
        stepIndex: steps.length,
      };
      const next = transition(state, { type: 'COMPLETE' });
      expect(next.status).toBe('completed');
      expect(next.completed).toBe(true);
      expect(next.stepIndex).toBe(0);
    });

    it.each<TourEvent>([
      { type: 'START' },
      { type: 'NEXT' },
      { type: 'PREV' },
      { type: 'SKIP' },
      { type: 'RESET' },
      { type: 'BEFORE_ENTER_COMPLETE', stepId: 'intro' },
    ])('done で $type は無視', (event) => {
      const state = {
        ...createInitialState(steps, false),
        status: 'done' as const,
      };
      const next = transition(state, event);
      expect(next).toBe(state);
    });
  });

  describe('completed', () => {
    it('RESET → idle + completed=false', () => {
      const state = createInitialState(steps, true);
      const next = transition(state, { type: 'RESET' });
      expect(next.status).toBe('idle');
      expect(next.completed).toBe(false);
      expect(next.stepIndex).toBe(0);
    });

    it.each<TourEvent>([
      { type: 'START' },
      { type: 'NEXT' },
      { type: 'PREV' },
      { type: 'SKIP' },
      { type: 'COMPLETE' },
      { type: 'BEFORE_ENTER_COMPLETE', stepId: 'intro' },
    ])('completed で $type は無視', (event) => {
      const state = createInitialState(steps, true);
      const next = transition(state, event);
      expect(next).toBe(state);
    });
  });
});
