'use client';

import { useIsMobile } from '@/lib/hooks/useIsMobile';

import { TourStepCenter } from './TourStepCenter';
import { TourStepPopover } from './TourStepPopover';
import { TourStepSheet } from './TourStepSheet';

import type { TourSnapshot, TourStepDef, TourStepPlacement } from '../types';

interface TourStepRendererProps {
  step: TourStepDef;
  snapshot: TourSnapshot;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
  onSkip: () => void;
}

/** placement に応じてPopover・Sheet・Centerの適切なコンポーネントに振り分けるレンダラー */
export function TourStepRenderer({
  step,
  snapshot,
  onNext,
  onPrev,
  onSkip,
}: TourStepRendererProps) {
  const isMobile = useIsMobile();

  const displayStep = snapshot.stepIndex + 1;
  const effectiveDescriptionKey =
    isMobile && step.descriptionMobileKey ? step.descriptionMobileKey : step.descriptionKey;

  // center 配置 — ターゲットなしの概念説明（PC/モバイル共通）
  if (step.placement === 'center') {
    return (
      <TourStepCenter
        titleKey={step.titleKey}
        descriptionKey={effectiveDescriptionKey}
        currentStep={displayStep}
        totalSteps={snapshot.totalSteps}
        isLastStep={snapshot.isLastStep}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        contentKey={step.contentKey}
      />
    );
  }

  if (isMobile) {
    return (
      <TourStepSheet
        titleKey={step.titleKey}
        descriptionKey={effectiveDescriptionKey}
        currentStep={displayStep}
        totalSteps={snapshot.totalSteps}
        isLastStep={snapshot.isLastStep}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
      />
    );
  }

  // center は上で処理済み → ここに到達する placement は top/bottom/left/right のみ
  const popoverPlacement = step.placement as Exclude<TourStepPlacement, 'center'>;

  return (
    <TourStepPopover
      targetSelector={step.targetSelector}
      placement={popoverPlacement}
      titleKey={step.titleKey}
      descriptionKey={effectiveDescriptionKey}
      currentStep={displayStep}
      totalSteps={snapshot.totalSteps}
      isLastStep={snapshot.isLastStep}
      onNext={onNext}
      onPrev={onPrev}
      onSkip={onSkip}
    />
  );
}
