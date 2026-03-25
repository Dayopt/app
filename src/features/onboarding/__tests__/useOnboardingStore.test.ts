/**
 * Onboarding Store Unit Tests
 *
 * useOnboardingStoreのステート管理ロジックをテスト
 */

import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useOnboardingStore } from '../stores/useOnboardingStore';

describe('useOnboardingStore', () => {
  beforeEach(() => {
    act(() => {
      useOnboardingStore.getState().reset();
    });
  });

  describe('initial state', () => {
    it('should have welcome as the initial step', () => {
      expect(useOnboardingStore.getState().currentStep).toBe('welcome');
    });

    it('should have empty displayName', () => {
      expect(useOnboardingStore.getState().displayName).toBe('');
    });

    it('should have null chronotypeType', () => {
      expect(useOnboardingStore.getState().chronotypeType).toBeNull();
    });

    it('should have showQuiz as false', () => {
      expect(useOnboardingStore.getState().showQuiz).toBe(false);
    });
  });

  describe('setDisplayName', () => {
    it('should update displayName', () => {
      act(() => {
        useOnboardingStore.getState().setDisplayName('Test User');
      });

      expect(useOnboardingStore.getState().displayName).toBe('Test User');
    });
  });

  describe('setChronotypeType', () => {
    it('should update chronotypeType and reset showQuiz', () => {
      // First set showQuiz to true
      act(() => {
        useOnboardingStore.getState().setShowQuiz(true);
      });
      expect(useOnboardingStore.getState().showQuiz).toBe(true);

      // Setting chronotype should reset showQuiz
      act(() => {
        useOnboardingStore.getState().setChronotypeType('lion');
      });

      expect(useOnboardingStore.getState().chronotypeType).toBe('lion');
      expect(useOnboardingStore.getState().showQuiz).toBe(false);
    });
  });

  describe('setShowQuiz', () => {
    it('should update showQuiz', () => {
      act(() => {
        useOnboardingStore.getState().setShowQuiz(true);
      });

      expect(useOnboardingStore.getState().showQuiz).toBe(true);
    });
  });

  describe('goToStep', () => {
    it('should navigate to specified step', () => {
      act(() => {
        useOnboardingStore.getState().goToStep('chronotype');
      });

      expect(useOnboardingStore.getState().currentStep).toBe('chronotype');
    });
  });

  describe('goNext', () => {
    it('should advance to the next step', () => {
      expect(useOnboardingStore.getState().currentStep).toBe('welcome');

      act(() => {
        useOnboardingStore.getState().goNext();
      });

      expect(useOnboardingStore.getState().currentStep).toBe('chronotype');
    });

    it('should not advance past the last step', () => {
      act(() => {
        useOnboardingStore.getState().goToStep('chronotype');
      });

      act(() => {
        useOnboardingStore.getState().goNext();
      });

      // Should stay at chronotype (last step)
      expect(useOnboardingStore.getState().currentStep).toBe('chronotype');
    });
  });

  describe('goBack', () => {
    it('should go back to the previous step', () => {
      act(() => {
        useOnboardingStore.getState().goToStep('chronotype');
      });

      act(() => {
        useOnboardingStore.getState().goBack();
      });

      expect(useOnboardingStore.getState().currentStep).toBe('welcome');
    });

    it('should not go back before the first step', () => {
      act(() => {
        useOnboardingStore.getState().goBack();
      });

      expect(useOnboardingStore.getState().currentStep).toBe('welcome');
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Modify all state
      act(() => {
        const store = useOnboardingStore.getState();
        store.setDisplayName('Test');
        store.setChronotypeType('wolf');
        store.goToStep('chronotype');
      });

      // Reset
      act(() => {
        useOnboardingStore.getState().reset();
      });

      const state = useOnboardingStore.getState();
      expect(state.currentStep).toBe('welcome');
      expect(state.displayName).toBe('');
      expect(state.chronotypeType).toBeNull();
      expect(state.showQuiz).toBe(false);
    });
  });
});
