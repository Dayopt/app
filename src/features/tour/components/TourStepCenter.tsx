'use client';

import { PlanVsRecordContent } from './content/PlanVsRecordContent';
import { TagExplainContent } from './content/TagExplainContent';
import { TourStepCard } from './TourStepCard';

import type { TourContentKey } from '../types';

interface TourStepCenterProps {
  titleKey: string;
  descriptionKey: string;
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
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
  onPrev,
  onSkip,
  contentKey,
}: TourStepCenterProps) {
  const contentProps = {
    currentStep,
    totalSteps,
    isLastStep,
    onNext,
    onPrev,
    onSkip,
  };

  return (
    <div className="z-tour fixed inset-0 flex items-center justify-center">
      <div className="bg-card animate-in fade-in zoom-in-95 mx-4 w-full max-w-80 rounded-xl p-6 shadow-md duration-150">
        {contentKey === 'tag-explain' ? (
          <TagExplainContent {...contentProps} />
        ) : contentKey === 'planned-vs-actual-visual' ? (
          <PlanVsRecordContent {...contentProps} />
        ) : (
          <TourStepCard titleKey={titleKey} descriptionKey={descriptionKey} {...contentProps} />
        )}
      </div>
    </div>
  );
}
