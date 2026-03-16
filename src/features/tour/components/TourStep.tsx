'use client';

import { useIsMobile } from '@/hooks/useIsMobile';

import { TourStepCenter } from './TourStepCenter';
import { TourStepPopover } from './TourStepPopover';
import { TourStepSheet } from './TourStepSheet';

import type { TourContentKey, TourStepPlacement } from '../types';

interface TourStepProps {
  targetSelector: string;
  placement: TourStepPlacement;
  titleKey: string;
  descriptionKey: string;
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onSkip: () => void;
  contentKey?: TourContentKey | undefined;
}

/** Center: Dialog / PC: Popover / Mobile: Sheet の分岐 */
export function TourStep(props: TourStepProps) {
  const isMobile = useIsMobile();

  // center 配置 — ターゲットなしの概念説明（PC/モバイル共通）
  if (props.placement === 'center') {
    return (
      <TourStepCenter
        titleKey={props.titleKey}
        descriptionKey={props.descriptionKey}
        currentStep={props.currentStep}
        totalSteps={props.totalSteps}
        isLastStep={props.isLastStep}
        onNext={props.onNext}
        onSkip={props.onSkip}
        contentKey={props.contentKey}
      />
    );
  }

  if (isMobile) {
    return (
      <TourStepSheet
        titleKey={props.titleKey}
        descriptionKey={props.descriptionKey}
        currentStep={props.currentStep}
        totalSteps={props.totalSteps}
        isLastStep={props.isLastStep}
        onNext={props.onNext}
        onSkip={props.onSkip}
      />
    );
  }

  // center は上で処理済み → ここに到達する placement は top/bottom/left/right のみ
  const popoverPlacement = props.placement as Exclude<TourStepPlacement, 'center'>;

  return (
    <TourStepPopover
      targetSelector={props.targetSelector}
      placement={popoverPlacement}
      titleKey={props.titleKey}
      descriptionKey={props.descriptionKey}
      currentStep={props.currentStep}
      totalSteps={props.totalSteps}
      isLastStep={props.isLastStep}
      onNext={props.onNext}
      onSkip={props.onSkip}
    />
  );
}
