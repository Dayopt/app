'use client';

import { cn } from '@/lib/utils';

import type { FindingSentiment } from '../../types/insights.types';

interface SentimentBadgeProps {
  sentiment: FindingSentiment;
  className?: string;
}

const SENTIMENT_STYLES: Record<FindingSentiment, string> = {
  positive: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  neutral: 'bg-muted text-muted-foreground',
  needs_attention: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const SENTIMENT_LABELS: Record<FindingSentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  needs_attention: 'Attention',
};

/**
 * SentimentBadge — findings の sentiment を色付きバッジで表示
 *
 * positive: 緑, neutral: グレー, needs_attention: アンバー
 */
export function SentimentBadge({ sentiment, className }: SentimentBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        SENTIMENT_STYLES[sentiment],
        className,
      )}
    >
      {SENTIMENT_LABELS[sentiment]}
    </span>
  );
}
