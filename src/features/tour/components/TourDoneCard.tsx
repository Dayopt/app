'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

interface TourDoneCardProps {
  onDone: () => void;
}

/** ツアー完了ダイアログ（中央表示） */
export function TourDoneCard({ onDone }: TourDoneCardProps) {
  const t = useTranslations();

  return (
    <div className="z-tour fixed inset-0 flex items-center justify-center">
      <div
        className="bg-card animate-in fade-in zoom-in-95 mx-4 flex w-full max-w-80 flex-col items-center gap-4 rounded-2xl p-8 text-center shadow-sm duration-150"
        role="dialog"
        aria-label={t('tour.done.title')}
      >
        <h2 className="text-foreground text-xl font-bold">{t('tour.done.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('tour.done.description')}</p>
        <Button onClick={onDone} className="w-full">
          {t('tour.done_button')}
        </Button>
      </div>
    </div>
  );
}
