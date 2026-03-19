'use client';

import { useEffect } from 'react';

import { useOnboardingStore } from '../stores/useOnboardingStore';
import { StepIndicator } from './shared/StepIndicator';

import type { PresetChronotypeType } from '@/types/chronotype';

import { ChronotypeStep } from './steps/ChronotypeStep';
import { WelcomeStep } from './steps/WelcomeStep';

interface ChronotypeCardData {
  type: PresetChronotypeType;
  emoji: string;
}

interface OnboardingWizardProps {
  /** Pre-filled name from profile (OAuth etc.) */
  initialName: string;
  /** Chronotype card data from chronotype feature */
  cardData: ChronotypeCardData[];
  /** Quiz component rendered from Composition Layer */
  quizComponent: React.ReactNode;
  /** Callbacks */
  onComplete: (data: { fullName: string; chronotypeType: PresetChronotypeType | null }) => void;
  isCompleting: boolean;
}

/** オンボーディングウィザードのメインコンポーネント（ステップ管理と各ステップの描画を担当） */
export function OnboardingWizard({
  initialName,
  cardData,
  quizComponent,
  onComplete,
  isCompleting,
}: OnboardingWizardProps) {
  const store = useOnboardingStore();

  // Reset store on mount to prevent cross-user state leakage
  useEffect(() => {
    store.reset();
    if (initialName) {
      store.setDisplayName(initialName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset once on mount
  }, []);

  const handleComplete = (chronotypeType: PresetChronotypeType | null) => {
    onComplete({
      fullName: store.displayName,
      chronotypeType,
    });
  };

  return (
    <div className="w-full max-w-md space-y-6 px-4">
      <StepIndicator currentStep={store.currentStep} />

      {store.currentStep === 'welcome' && (
        <WelcomeStep
          displayName={store.displayName}
          hasExistingName={!!initialName}
          onNameChange={store.setDisplayName}
          onContinue={store.goNext}
        />
      )}

      {store.currentStep === 'chronotype' && (
        <ChronotypeStep
          selectedType={store.chronotypeType}
          showQuiz={store.showQuiz}
          cardData={cardData}
          quizComponent={quizComponent}
          onSelect={store.setChronotypeType}
          onShowQuiz={() => store.setShowQuiz(true)}
          onComplete={() => handleComplete(store.chronotypeType)}
          onBack={() => {
            if (store.showQuiz) {
              store.setShowQuiz(false);
            } else {
              store.goBack();
            }
          }}
          onSkip={() => handleComplete(null)}
          isCompleting={isCompleting}
        />
      )}
    </div>
  );
}
