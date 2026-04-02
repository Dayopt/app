'use client';

import type { LucideIcon } from 'lucide-react';
import { Briefcase, Dumbbell, Users } from 'lucide-react';
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

/** タグ＝タイトルであることをシンプルに伝えるコンテンツ */
export function TagExplainContent({
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TourContentProps) {
  const t = useTranslations();

  const examples: Array<{ icon: LucideIcon; color: string; name: string }> = [
    {
      icon: Briefcase,
      color: 'var(--tag-blue)',
      name: t('tour.steps.explainTags.examples.deepWork'),
    },
    {
      icon: Dumbbell,
      color: 'var(--tag-green)',
      name: t('tour.steps.explainTags.examples.exercise'),
    },
    { icon: Users, color: 'var(--tag-amber)', name: t('tour.steps.explainTags.examples.meeting') },
  ];

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
        <p className="text-muted-foreground mt-1 text-sm">
          {t('tour.steps.explainTags.description')}
        </p>
      </div>

      {/* タグ例 */}
      <div className="flex items-center gap-2">
        {examples.map((example) => (
          <div key={example.name} className="flex items-center gap-1">
            <example.icon className="size-4" style={{ color: example.color }} aria-hidden />
            <span className="text-foreground text-xs">{example.name}</span>
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
