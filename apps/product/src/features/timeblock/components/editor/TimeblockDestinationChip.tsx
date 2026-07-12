'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import type { TimeblockDestination } from '../../domain/timeblock-destination';

interface TimeModelDestinationChipProps {
  destination: TimeblockDestination;
}

/** 終了時刻から導出した保存先を表示するチップ。選択操作は提供しない。 */
export function TimeblockDestinationChip({ destination }: TimeModelDestinationChipProps) {
  const t = useTranslations('timeblock.editor.destination');
  const isPlan = destination === 'plan';

  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium',
        isPlan ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
      )}
      aria-live="polite"
    >
      {isPlan ? t('plan') : t('log')}
    </span>
  );
}
