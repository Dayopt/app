'use client';

import { useCallback } from 'react';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import type { PresetChronotypeType } from '@/types/chronotype';

import { AnimalCard } from '../shared/AnimalCard';

interface ChronotypeCardData {
  type: PresetChronotypeType;
  emoji: string;
}

interface ChronotypeStepProps {
  selectedType: PresetChronotypeType | null;
  showQuiz: boolean;
  cardData: ChronotypeCardData[];
  quizComponent: React.ReactNode;
  onSelect: (type: PresetChronotypeType) => void;
  onShowQuiz: () => void;
  onComplete: () => void;
  onBack: () => void;
  onSkip: () => void;
  isCompleting: boolean;
}

/** オンボーディングのクロノタイプ選択ステップコンポーネント */
export function ChronotypeStep({
  selectedType,
  showQuiz,
  cardData,
  quizComponent,
  onSelect,
  onShowQuiz,
  onComplete,
  onBack,
  onSkip,
  isCompleting,
}: ChronotypeStepProps) {
  const t = useTranslations();

  const handleSelect = useCallback(
    (type: PresetChronotypeType) => {
      onSelect(type);
    },
    [onSelect],
  );

  if (showQuiz) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('onboarding.back')}
        </Button>
        {quizComponent}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {t('onboarding.chronotype.title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('onboarding.chronotype.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {cardData.map((card) => (
          <AnimalCard
            key={card.type}
            type={card.type}
            emoji={card.emoji}
            name={t(`onboarding.chronotype.${card.type}.name`)}
            trait={t(`onboarding.chronotype.${card.type}.trait`)}
            time={t(`onboarding.chronotype.${card.type}.time`)}
            hint={t(`onboarding.chronotype.${card.type}.hint`)}
            isSelected={selectedType === card.type}
            onSelect={handleSelect}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onShowQuiz}
        className="text-primary hover:text-primary block w-full text-center text-sm transition-colors"
      >
        {t('onboarding.chronotype.quizLink')} →
      </button>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('onboarding.back')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onComplete}
          disabled={!selectedType || isCompleting}
          isLoading={isCompleting}
        >
          {t('onboarding.getStarted')}
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSkip}
        className="text-muted-foreground hover:text-foreground w-full"
      >
        {t('onboarding.chronotype.skipLink')}
      </Button>
    </div>
  );
}
