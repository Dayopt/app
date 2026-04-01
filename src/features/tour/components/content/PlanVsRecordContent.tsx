'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

interface TourContentProps {
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onPrev?: (() => void) | undefined;
  onSkip: () => void;
}

/** 予定時間 vs 実績時間をミニ図解で視覚的に説明するリッチコンテンツ */
export function PlanVsRecordContent({
  currentStep,
  totalSteps,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TourContentProps) {
  const t = useTranslations();

  return (
    <div
      className="flex flex-col gap-4"
      role="dialog"
      aria-label={t('tour.steps.planVsRecord.title')}
    >
      <div>
        <p className="text-muted-foreground text-xs">
          {t('tour.step', { current: currentStep, total: totalSteps })}
        </p>
        <h3 className="text-foreground font-bold">{t('tour.steps.planVsRecord.title')}</h3>
      </div>

      {/* ミニ図解: Planned vs Actual */}
      <div className="flex flex-col gap-2">
        {/* Planned time */}
        <div className="flex items-center gap-2">
          <div className="bg-tag-blue-tint border-tag-blue border-l-indicator flex h-10 shrink-0 items-center rounded-lg px-2">
            <span className="text-foreground text-xs font-medium whitespace-nowrap tabular-nums">
              10:00–11:00
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-foreground text-xs font-medium">
              {t('tour.steps.planVsRecord.planLabel')}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('tour.steps.planVsRecord.planDetail')}
            </span>
          </div>
        </div>

        {/* 差分矢印 */}
        <div className="text-muted-foreground flex items-center gap-2 pl-8">
          <svg
            className="size-4"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M8 3v7m0 0l-3-3m3 3l3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-xs">{t('tour.steps.planVsRecord.autoConvert')}</span>
        </div>

        {/* Actual time */}
        <div className="flex items-center gap-2">
          <div className="bg-tag-blue-tint border-tag-blue border-l-indicator flex h-10 shrink-0 items-center rounded-lg px-2">
            <span className="text-foreground text-xs font-medium whitespace-nowrap tabular-nums">
              10:15–11:30
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-foreground text-xs font-medium">
              {t('tour.steps.planVsRecord.recordLabel')}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('tour.steps.planVsRecord.recordDetail')}
            </span>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            onClick={onSkip}
          >
            {t('tour.skip')}
          </button>
          {onPrev && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              onClick={onPrev}
            >
              {t('tour.back')}
            </button>
          )}
        </div>
        <Button size="sm" onClick={onNext}>
          {isLastStep ? t('tour.done_button') : t('tour.next')}
        </Button>
      </div>
    </div>
  );
}
