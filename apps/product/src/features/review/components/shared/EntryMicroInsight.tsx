'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import type { MicroInsight } from '../../lib/microInsights';

interface EntryMicroInsightProps {
  insight: MicroInsight | null;
  className?: string;
}

/**
 * EntryMicroInsight — Inspector 内の1行インサイト
 *
 * watching AI: 言うべきことがあるときだけ、控えめに表示。
 * insight が null なら何も表示しない。
 */
export function EntryMicroInsight({ insight, className }: EntryMicroInsightProps) {
  const t = useTranslations('calendar.stats.insights');

  if (!insight) return null;

  return (
    <p className={cn('text-muted-foreground text-xs leading-relaxed', className)}>
      {t(insight.messageKey, insight.messageParams)}
    </p>
  );
}
