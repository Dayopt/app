'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { OnboardingStep } from '../types';
import { ONBOARDING_STEPS } from '../types';

import type { PresetChronotypeType } from '@/types/chronotype';

interface OnboardingState {
  currentStep: OnboardingStep;
  displayName: string;
  chronotypeType: PresetChronotypeType | null;
  showQuiz: boolean;
}

interface OnboardingActions {
  setDisplayName: (name: string) => void;
  setChronotypeType: (type: PresetChronotypeType) => void;
  setShowQuiz: (show: boolean) => void;
  goToStep: (step: OnboardingStep) => void;
  goNext: () => void;
  goBack: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()(
  devtools(
    (set, get) => ({
      currentStep: 'welcome',
      displayName: '',
      chronotypeType: null,
      showQuiz: false,

      setDisplayName: (name) => set({ displayName: name }),
      setChronotypeType: (type) => set({ chronotypeType: type, showQuiz: false }),
      setShowQuiz: (show) => set({ showQuiz: show }),
      goToStep: (step) => set({ currentStep: step }),

      goNext: () => {
        const { currentStep } = get();
        const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
        const nextStep = ONBOARDING_STEPS[currentIndex + 1];
        if (nextStep) {
          set({ currentStep: nextStep });
        }
      },

      goBack: () => {
        const { currentStep } = get();
        const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
        const prevStep = ONBOARDING_STEPS[currentIndex - 1];
        if (prevStep) {
          set({ currentStep: prevStep });
        }
      },

      reset: () =>
        set({
          currentStep: 'welcome',
          displayName: '',
          chronotypeType: null,
          showQuiz: false,
        }),
    }),
    { name: 'onboarding-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
