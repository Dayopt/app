'use client';

/**
 * 充実度インライン行
 *
 * icon + label（左）、3つのトグルアイコン（右）
 * ワンクリックで選択、もう一回クリックで解除。
 */

import { Frown, Meh, Smile } from 'lucide-react';
import { useCallback } from 'react';

import { cn } from '@/lib/utils';

import type { FulfillmentScore } from '../../../types/entry';

const SCORE_OPTIONS: { score: FulfillmentScore; icon: typeof Smile }[] = [
  { score: 1, icon: Frown },
  { score: 2, icon: Meh },
  { score: 3, icon: Smile },
];

interface FulfillmentRowProps {
  label: string;
  score: FulfillmentScore | null;
  onScoreChange: (value: FulfillmentScore | null) => void;
  disabled?: boolean;
}

export function FulfillmentRow({
  label,
  score,
  onScoreChange,
  disabled = false,
}: FulfillmentRowProps) {
  const handleToggle = useCallback(
    (value: FulfillmentScore) => {
      onScoreChange(score === value ? null : value);
    },
    [score, onScoreChange],
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Smile className="text-muted-foreground size-4 flex-shrink-0" />
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {SCORE_OPTIONS.map(({ score: value, icon: Icon }) => {
          const isSelected = score === value;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => handleToggle(value)}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg transition-colors',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-50',
                isSelected
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
