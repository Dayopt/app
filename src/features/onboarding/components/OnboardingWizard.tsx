'use client';

import { useReducer } from 'react';

import { ONBOARDING_STEPS } from '../types';
import { StepIndicator } from './shared/StepIndicator';

import type { OnboardingStep } from '../types';

import type { PresetChronotypeType } from '@/lib/types/chronotype';

import { ChronotypeStep } from './steps/ChronotypeStep';
import { WelcomeStep } from './steps/WelcomeStep';

interface ChronotypeCardData {
  type: PresetChronotypeType;
  emoji: string;
}

/** クイズコンポーネントに渡されるコールバック */
export interface QuizCallbacks {
  onChronotypeSelect: (type: PresetChronotypeType) => void;
  onHideQuiz: () => void;
}

interface OnboardingWizardProps {
  /** Pre-filled name from profile (OAuth etc.) */
  initialName: string;
  /** Override the starting step (useful for Storybook) */
  initialStep?: OnboardingStep;
  /** Chronotype card data from chronotype feature */
  cardData: ChronotypeCardData[];
  /** Quiz component factory — receives wizard callbacks so quiz can update wizard state */
  renderQuiz: (callbacks: QuizCallbacks) => React.ReactNode;
  /** Callbacks */
  onComplete: (data: { fullName: string; chronotypeType: PresetChronotypeType | null }) => void;
  isCompleting: boolean;
}

// ─────────────────────────────────────────────────────────
// State / Reducer
// ─────────────────────────────────────────────────────────

interface OnboardingState {
  currentStep: OnboardingStep;
  displayName: string;
  chronotypeType: PresetChronotypeType | null;
  showQuiz: boolean;
}

type OnboardingAction =
  | { type: 'SET_DISPLAY_NAME'; name: string }
  | { type: 'SET_CHRONOTYPE_TYPE'; chronotypeType: PresetChronotypeType }
  | { type: 'SET_SHOW_QUIZ'; show: boolean }
  | { type: 'GO_NEXT' }
  | { type: 'GO_BACK' };

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'SET_DISPLAY_NAME':
      return { ...state, displayName: action.name };
    case 'SET_CHRONOTYPE_TYPE':
      return { ...state, chronotypeType: action.chronotypeType, showQuiz: false };
    case 'SET_SHOW_QUIZ':
      return { ...state, showQuiz: action.show };
    case 'GO_NEXT': {
      const currentIndex = ONBOARDING_STEPS.indexOf(state.currentStep);
      const nextStep = ONBOARDING_STEPS[currentIndex + 1];
      return nextStep ? { ...state, currentStep: nextStep } : state;
    }
    case 'GO_BACK': {
      const currentIndex = ONBOARDING_STEPS.indexOf(state.currentStep);
      const prevStep = ONBOARDING_STEPS[currentIndex - 1];
      return prevStep ? { ...state, currentStep: prevStep } : state;
    }
    default:
      return state;
  }
}

function getInitialState([initialName, initialStep]: [string, OnboardingStep]): OnboardingState {
  return {
    currentStep: initialStep,
    displayName: initialName,
    chronotypeType: null,
    showQuiz: false,
  };
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

/** オンボーディングウィザードのメインコンポーネント（ステップ管理と各ステップの描画を担当） */
export function OnboardingWizard({
  initialName,
  initialStep = 'welcome',
  cardData,
  renderQuiz,
  onComplete,
  isCompleting,
}: OnboardingWizardProps) {
  const [state, dispatch] = useReducer(
    onboardingReducer,
    [initialName, initialStep] as [string, OnboardingStep],
    getInitialState,
  );

  const handleComplete = (chronotypeType: PresetChronotypeType | null) => {
    onComplete({
      fullName: state.displayName,
      chronotypeType,
    });
  };

  const quizCallbacks: QuizCallbacks = {
    onChronotypeSelect: (chronotypeType) =>
      dispatch({ type: 'SET_CHRONOTYPE_TYPE', chronotypeType }),
    onHideQuiz: () => dispatch({ type: 'SET_SHOW_QUIZ', show: false }),
  };

  return (
    <div className="w-full max-w-md space-y-6 px-4">
      <StepIndicator currentStep={state.currentStep} />

      {state.currentStep === 'welcome' && (
        <WelcomeStep
          displayName={state.displayName}
          hasExistingName={!!initialName}
          onNameChange={(name) => dispatch({ type: 'SET_DISPLAY_NAME', name })}
          onContinue={() => dispatch({ type: 'GO_NEXT' })}
        />
      )}

      {state.currentStep === 'chronotype' && (
        <ChronotypeStep
          selectedType={state.chronotypeType}
          showQuiz={state.showQuiz}
          cardData={cardData}
          quizComponent={renderQuiz(quizCallbacks)}
          onSelect={(chronotypeType) => dispatch({ type: 'SET_CHRONOTYPE_TYPE', chronotypeType })}
          onShowQuiz={() => dispatch({ type: 'SET_SHOW_QUIZ', show: true })}
          onComplete={() => handleComplete(state.chronotypeType)}
          onBack={() => {
            if (state.showQuiz) {
              dispatch({ type: 'SET_SHOW_QUIZ', show: false });
            } else {
              dispatch({ type: 'GO_BACK' });
            }
          }}
          onSkip={() => handleComplete(null)}
          isCompleting={isCompleting}
        />
      )}
    </div>
  );
}
