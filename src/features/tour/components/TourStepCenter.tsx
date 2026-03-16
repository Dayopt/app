'use client';

import type { TourContentKey } from '../types';
import { TourPlanVsRecordContent } from './TourPlanVsRecordContent';
import { TourStepCard } from './TourStepCard';
import { TourTagExplainContent } from './TourTagExplainContent';

interface TourStepCenterProps {
  titleKey: string;
  descriptionKey: string;
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onSkip: () => void;
  contentKey?: TourContentKey | undefined;
}

/** 中央 Dialog 表示 — ターゲット要素なしの概念説明ステップ用 */
export function TourStepCenter({
  titleKey,
  descriptionKey,
  currentStep,
  totalSteps,
  isLastStep,
  onNext,
  onSkip,
  contentKey,
}: TourStepCenterProps) {
  return (
    <div className="z-tour fixed inset-0 flex items-center justify-center">
      <div className="bg-card animate-in fade-in zoom-in-95 w-80 rounded-xl p-6 shadow-lg duration-150">
        {contentKey === 'tag-explain' ? (
          <TourTagExplainContent
            currentStep={currentStep}
            totalSteps={totalSteps}
            onNext={onNext}
            onSkip={onSkip}
          />
        ) : contentKey === 'plan-vs-record-visual' ? (
          <TourPlanVsRecordContent
            currentStep={currentStep}
            totalSteps={totalSteps}
            isLastStep={isLastStep}
            onNext={onNext}
            onSkip={onSkip}
          />
        ) : (
          <TourStepCard
            titleKey={titleKey}
            descriptionKey={descriptionKey}
            currentStep={currentStep}
            totalSteps={totalSteps}
            isLastStep={isLastStep}
            onNext={onNext}
            onSkip={onSkip}
          />
        )}
      </div>
    </div>
  );
}
