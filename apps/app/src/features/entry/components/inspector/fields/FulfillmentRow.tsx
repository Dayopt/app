'use client';

/**
 * 充実度インライン行
 *
 * icon + label（左）、3つのトグルアイコン（右）
 * ワンクリックで選択、もう一回クリックで解除。
 */

import { Frown, Meh, Smile } from 'lucide-react';
import { useCallback } from 'react';

import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { FulfillmentScore } from '../../../types/entry';

const SCORE_OPTIONS: {
  score: FulfillmentScore;
  icon: typeof Smile;
  labelKey: 'low' | 'medium' | 'high';
}[] = [
  { score: 1, icon: Frown, labelKey: 'low' },
  { score: 2, icon: Meh, labelKey: 'medium' },
  { score: 3, icon: Smile, labelKey: 'high' },
];

interface FulfillmentRowProps {
  label: string;
  score: FulfillmentScore | null;
  onScoreChange: (value: FulfillmentScore | null) => void;
  disabled?: boolean;
  scoreLabels?: Record<'low' | 'medium' | 'high', string>;
  tooltipLabels?: Record<'low' | 'medium' | 'high', string>;
}

const DEFAULT_SCORE_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Inspectorの充実度入力行（3段階トグルアイコン、再クリックで解除） */
export function FulfillmentRow({
  label,
  score,
  onScoreChange,
  disabled = false,
  scoreLabels = DEFAULT_SCORE_LABELS,
  tooltipLabels,
}: FulfillmentRowProps) {
  const handleToggle = useCallback(
    (value: FulfillmentScore) => {
      onScoreChange(score === value ? null : value);
    },
    [score, onScoreChange],
  );

  return (
    <div className="flex min-h-11 items-center justify-between">
      <div className="flex items-center gap-2">
        <Smile className="text-muted-foreground size-4 flex-shrink-0" />
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {SCORE_OPTIONS.map(({ score: value, icon: Icon, labelKey }) => {
          const isSelected = score === value;
          const button = (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => handleToggle(value)}
              aria-label={scoreLabels[labelKey]}
              aria-pressed={isSelected}
              className={cn(
                'flex size-10 items-center justify-center rounded-lg transition-colors',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-50',
                isSelected
                  ? 'bg-state-selected text-foreground'
                  : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
            </button>
          );

          if (tooltipLabels) {
            return (
              <HoverTooltip key={value} content={tooltipLabels[labelKey]} side="bottom">
                {button}
              </HoverTooltip>
            );
          }

          return button;
        })}
      </div>
    </div>
  );
}
