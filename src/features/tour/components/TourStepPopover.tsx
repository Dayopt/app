'use client';

import { useLayoutEffect, useRef } from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@/lib/components/ui/popover';

import { TourStepCard } from './TourStepCard';

interface TourStepPopoverProps {
  targetSelector: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  titleKey: string;
  descriptionKey: string;
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
  onSkip: () => void;
}

/** PC向け: Radix Popover でターゲット要素にアンカー */
export function TourStepPopover({
  targetSelector,
  placement,
  titleKey,
  descriptionKey,
  currentStep,
  totalSteps,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TourStepPopoverProps) {
  const anchorRef = useRef<HTMLDivElement>(null);

  // useLayoutEffect: DOM計測 → アンカー配置 → ペイント前に完了（フラッシュなし）
  // TourController が activeSteps フィルタでターゲット存在を保証済み
  useLayoutEffect(() => {
    const target = document.querySelector(targetSelector);
    if (!target || !anchorRef.current) return;

    // ターゲットの位置にアンカーを配置
    const rect = target.getBoundingClientRect();
    const anchor = anchorRef.current;
    anchor.style.position = 'fixed';
    anchor.style.left = `${rect.left + rect.width / 2}px`;
    anchor.style.top = `${rect.top + rect.height / 2}px`;
    anchor.style.width = '0';
    anchor.style.height = '0';

    // ターゲットを前面に（position は触らない — PlanCard 等の absolute 配置を壊さないため）
    const el = target as HTMLElement;
    const prevZIndex = el.style.zIndex;
    el.style.zIndex = 'var(--z-index-tour)';

    // スクロールしてターゲットを表示
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return () => {
      el.style.zIndex = prevZIndex;
    };
  }, [targetSelector]);

  return (
    <Popover open>
      <PopoverAnchor ref={anchorRef} asChild>
        <div />
      </PopoverAnchor>
      <PopoverContent
        side={placement}
        sideOffset={12}
        className="z-tour w-72"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
      </PopoverContent>
    </Popover>
  );
}
