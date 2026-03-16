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

/** タグの3つの役割をビジュアルで説明するリッチコンテンツ */
export function TagExplainContent({
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TourContentProps) {
  const t = useTranslations();

  const examples = [
    { color: 'bg-tag-blue', name: t('tour.steps.explainTags.examples.deepWork') },
    { color: 'bg-tag-green', name: t('tour.steps.explainTags.examples.exercise') },
    { color: 'bg-tag-amber', name: t('tour.steps.explainTags.examples.meeting') },
  ] as const;

  const roles = [
    {
      label: t('tour.steps.explainTags.categorize.label'),
      detail: t('tour.steps.explainTags.categorize.detail'),
    },
    {
      label: t('tour.steps.explainTags.colorCode.label'),
      detail: t('tour.steps.explainTags.colorCode.detail'),
    },
    {
      label: t('tour.steps.explainTags.trackStats.label'),
      detail: t('tour.steps.explainTags.trackStats.detail'),
    },
  ] as const;

  return (
    <div
      className="flex flex-col gap-4"
      role="dialog"
      aria-label={t('tour.steps.explainTags.title')}
    >
      <div>
        <p className="text-muted-foreground text-xs">
          {t('tour.step', { current: currentStep, total: totalSteps })}
        </p>
        <h3 className="text-foreground font-bold">{t('tour.steps.explainTags.title')}</h3>
      </div>

      {/* タグ例の色ドット */}
      <div className="flex items-center gap-3">
        {examples.map((example) => (
          <div key={example.name} className="flex items-center gap-1.5">
            <span className={`${example.color} size-2.5 rounded-full`} />
            <span className="text-foreground text-xs font-medium">{example.name}</span>
          </div>
        ))}
      </div>

      {/* 3つの役割 */}
      <div className="flex flex-col gap-2">
        {roles.map((role, i) => (
          <div key={role.label} className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5 text-xs font-medium tabular-nums">
              {i + 1}.
            </span>
            <div>
              <span className="text-foreground text-sm font-medium">{role.label}</span>
              <span className="text-muted-foreground text-sm"> — {role.detail}</span>
            </div>
          </div>
        ))}
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
          {t('tour.next')}
        </Button>
      </div>
    </div>
  );
}
