'use client';

import { cn } from '@/lib/utils';

export interface TimeChip {
  key: string;
  label: string;
  disabled?: boolean;
}

interface TimeChipRowProps {
  chips: TimeChip[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onCustomClick?: (() => void) | undefined;
}

/**
 * 開始時刻チップ行。
 *
 * `[今] [14:30] [15:00] [▼]` の 4 要素構成を想定。
 * `▼` チップは `onCustomClick` を渡したとき末尾に表示される。
 * 実時刻の動的算出は (f) で接続予定。(b) 時点では chips を props で受ける。
 */
export function TimeChipRow({ chips, selectedKey, onSelect, onCustomClick }: TimeChipRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const isSelected = selectedKey === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            disabled={chip.disabled}
            onClick={() => onSelect(chip.key)}
            aria-pressed={isSelected}
            className={cn(
              'inline-flex h-8 items-center rounded-lg border px-4 text-sm tabular-nums transition-colors duration-150',
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-foreground hover:bg-state-hover',
              chip.disabled && 'opacity-40',
              chip.disabled && 'cursor-not-allowed',
            )}
          >
            {chip.label}
          </button>
        );
      })}
      {onCustomClick ? (
        <button
          type="button"
          onClick={onCustomClick}
          aria-label="任意時刻を入力"
          className="border-border text-foreground hover:bg-state-hover inline-flex h-8 items-center rounded-lg border px-2 transition-colors duration-150"
        >
          <span aria-hidden className="text-xs">
            ▼
          </span>
        </button>
      ) : null}
    </div>
  );
}
