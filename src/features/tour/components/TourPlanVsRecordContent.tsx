'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

interface TourPlanVsRecordContentProps {
  currentStep: number;
  totalSteps: number;
  isLastStep: boolean;
  onNext: () => void;
  onSkip: () => void;
}

/** Plan vs Record をミニ図解で視覚的に比較するリッチコンテンツ */
export function TourPlanVsRecordContent({
  currentStep,
  totalSteps,
  isLastStep,
  onNext,
  onSkip,
}: TourPlanVsRecordContentProps) {
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

      {/* ミニ図解: Plan vs Record */}
      <div className="flex flex-col gap-3">
        {/* Plan */}
        <div className="flex items-center gap-3">
          <div className="bg-tag-blue-tint border-tag-blue flex h-10 w-20 items-center rounded-md border-l-3 pl-2">
            <span className="text-foreground text-xs font-medium">Plan</span>
          </div>
          <div className="flex flex-col">
            <span className="text-foreground text-xs font-medium">
              {t('tour.steps.planVsRecord.planLabel', { defaultMessage: '予定' })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('tour.steps.planVsRecord.planDetail', {
                defaultMessage: 'これからやること',
              })}
            </span>
          </div>
        </div>

        {/* 矢印 */}
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
          <span className="text-xs">
            {t('tour.steps.planVsRecord.autoConvert', {
              defaultMessage: '時間が過ぎると自動変換',
            })}
          </span>
        </div>

        {/* Record */}
        <div className="flex items-center gap-3">
          <div className="bg-tag-green-tint border-tag-green flex h-10 w-20 items-center rounded-md border-l-3 border-dashed pl-2">
            <span className="text-foreground text-xs font-medium">Record</span>
          </div>
          <div className="flex flex-col">
            <span className="text-foreground text-xs font-medium">
              {t('tour.steps.planVsRecord.recordLabel', { defaultMessage: '記録' })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t('tour.steps.planVsRecord.recordDetail', {
                defaultMessage: '実際にやったこと',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          onClick={onSkip}
        >
          {t('tour.skip')}
        </button>
        <Button size="sm" onClick={onNext}>
          {isLastStep ? t('tour.done_button') : t('tour.next')}
        </Button>
      </div>
    </div>
  );
}
