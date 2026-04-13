'use client';

import { Sheet, SheetContent } from '@/lib/components/ui/sheet';

import { TourStepCard } from './TourStepCard';

interface TourStepSheetProps {
  titleKey: string;
  descriptionKey: string;
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
  onSkip: () => void;
}

/** モバイル向け: 下部 Sheet でステップコンテンツを表示 */
export function TourStepSheet({
  titleKey,
  descriptionKey,
  currentStep,
  totalSteps,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TourStepSheetProps) {
  return (
    <Sheet open>
      <SheetContent
        side="bottom"
        className="z-tour rounded-t-2xl"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="p-4">
          <TourStepCard
            titleKey={titleKey}
            descriptionKey={descriptionKey}
            currentStep={currentStep}
            totalSteps={totalSteps}
            isLastStep={isLastStep}
            onNext={onNext}
            onPrev={onPrev}
            onSkip={onSkip}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
