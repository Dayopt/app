'use client';

import { useCallback, useState } from 'react';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { CHRONOTYPE_EMOJI, CHRONOTYPE_PRESETS } from '../lib/constants';
import {
  calculateChronotypeResult,
  CHRONOTYPE_QUIZ_QUESTIONS,
  QUIZ_QUESTION_COUNT,
} from '../lib/quiz';

import type { PresetChronotypeType } from '@/types/chronotype';

interface ChronotypeQuizProps {
  onComplete: (type: PresetChronotypeType) => void;
  onCancel: () => void;
}

/** クイズの状態: 回答中 or 結果表示 */
type QuizPhase = 'answering' | 'result';

/** クロノタイプ診断クイズコンポーネント（6問の設問で自動判定） */
export function ChronotypeQuiz({ onComplete, onCancel }: ChronotypeQuizProps) {
  const t = useTranslations();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<QuizPhase>('answering');
  const [resultType, setResultType] = useState<PresetChronotypeType | null>(null);

  // currentStep is always within bounds (0..QUIZ_QUESTION_COUNT-1)
  const question = CHRONOTYPE_QUIZ_QUESTIONS[currentStep] as (typeof CHRONOTYPE_QUIZ_QUESTIONS)[0];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === QUIZ_QUESTION_COUNT - 1;
  const selectedOption = answers[question.id] ?? '';
  const progress = ((currentStep + 1) / QUIZ_QUESTION_COUNT) * 100;

  const handleSelect = useCallback(
    (value: string) => {
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
    },
    [question.id],
  );

  const handleNext = useCallback(() => {
    if (!selectedOption) return;

    if (isLastStep) {
      const result = calculateChronotypeResult(answers);
      setResultType(result);
      setPhase('result');
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [selectedOption, isLastStep, answers]);

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      onCancel();
    } else {
      setCurrentStep((prev) => prev - 1);
    }
  }, [isFirstStep, onCancel]);

  const handleConfirmResult = useCallback(() => {
    if (resultType) {
      onComplete(resultType);
    }
  }, [resultType, onComplete]);

  // --- 結果サマリー画面 ---
  if (phase === 'result' && resultType) {
    const preset = CHRONOTYPE_PRESETS[resultType];
    const deepZone = preset.productivityZones.find((z) => z.level === 'deep');
    const deepTimeStr = deepZone ? `${deepZone.startHour}:00 – ${deepZone.endHour}:00` : '';

    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="text-5xl">{CHRONOTYPE_EMOJI[resultType]}</span>
        <h3 className="text-foreground text-xl font-bold">
          {t('onboarding.chronotype.quizResult.title', {
            type: t(`onboarding.chronotype.${resultType}.name`),
          })}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('onboarding.chronotype.quizResult.description', {
            deepTime: deepTimeStr,
          })}
        </p>
        <Button variant="primary" onClick={handleConfirmResult} className="mt-2 w-full">
          {t('onboarding.chronotype.quizResult.confirm')}
        </Button>
      </div>
    );
  }

  // --- クイズ回答画面 ---
  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>
            {t('settings.chronotype.quiz.progress', {
              current: currentStep + 1,
              total: QUIZ_QUESTION_COUNT,
            })}
          </span>
        </div>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="space-y-4">
        <h4 className="text-base font-normal">
          {t(`settings.chronotype.quiz.questions.${question.id}.title`)}
        </h4>

        <RadioGroup value={selectedOption} onValueChange={handleSelect} className="gap-4">
          {question.options.map((option) => (
            <label
              key={option.id}
              className={
                'border-border hover:bg-state-hover flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-colors' +
                (selectedOption === option.id ? ' bg-state-hover border-primary' : '')
              }
            >
              <RadioGroupItem value={option.id} id={`${question.id}-${option.id}`} />
              <Label htmlFor={`${question.id}-${option.id}`} className="cursor-pointer font-normal">
                {t(`settings.chronotype.quiz.questions.${question.id}.options.${option.id}`)}
              </Label>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft />
          {isFirstStep ? t('settings.chronotype.quiz.cancel') : t('settings.chronotype.quiz.back')}
        </Button>
        <Button variant="primary" size="sm" onClick={handleNext} disabled={!selectedOption}>
          {isLastStep
            ? t('settings.chronotype.quiz.showResult')
            : t('settings.chronotype.quiz.next')}
          {!isLastStep && <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}
