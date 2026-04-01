'use client';

import { useTranslations } from 'next-intl';

import { ONBOARDING_STEP_COUNT, ONBOARDING_STEPS } from '../../types';

import type { OnboardingStep } from '../../types';

interface StepIndicatorProps {
  currentStep: OnboardingStep;
}

/** オンボーディングのステップ進捗インジケーターコンポーネント */
export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const t = useTranslations();
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-2">
        {ONBOARDING_STEPS.map((step, index) => (
          <div
            key={step}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              index <= currentIndex ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <span className="text-muted-foreground text-xs">
        {t('onboarding.step', {
          current: currentIndex + 1,
          total: ONBOARDING_STEP_COUNT,
        })}
      </span>
    </div>
  );
}
