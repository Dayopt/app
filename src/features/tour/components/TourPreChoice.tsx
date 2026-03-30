'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

interface TourPreChoiceProps {
  onStart: () => void;
  onSkip: () => void;
}

/** ツアー開始前の選択画面 — 「体験する」or「自分で探索する」 */
export function TourPreChoice({ onStart, onSkip }: TourPreChoiceProps) {
  const t = useTranslations();

  return (
    <div className="z-tour fixed inset-0 flex items-center justify-center">
      <div
        className="bg-card animate-in fade-in zoom-in-95 mx-4 flex w-full max-w-80 flex-col items-center gap-4 rounded-xl p-8 text-center shadow-sm duration-150"
        role="dialog"
        aria-label={t('tour.preChoice.title')}
      >
        <h2 className="text-foreground text-xl font-bold">{t('tour.preChoice.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('tour.preChoice.description')}</p>
        <div className="flex w-full flex-col gap-2">
          <Button onClick={onStart} className="w-full">
            {t('tour.preChoice.start')}
          </Button>
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground w-full"
          >
            {t('tour.preChoice.skip')}
          </Button>
        </div>
      </div>
    </div>
  );
}
