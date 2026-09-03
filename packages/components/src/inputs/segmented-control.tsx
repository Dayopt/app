'use client';

import { cn } from '../cn';

/**
 * SegmentedControl — 少数の排他的な選択肢を横に並べて切り替える。
 *
 * radix には依存しない。`role="group"` + `aria-pressed` の素の button で足りる範囲に
 * 用途を限っている（ドロップダウンが要るほど選択肢が増えたら `DropdownMenu` を使う）。
 * 目安は 2〜4 個で、それを超えるならこの部品は向いていない。
 *
 * タッチターゲットは 44px を確保する（`min-h-11`）。
 */

export interface SegmentedControlOption<TValue extends string> {
  value: TValue;
  label: string;
  /** 読み上げ用の補足。省略時は `label` がそのまま読まれる。 */
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
}

export interface SegmentedControlProps<TValue extends string> {
  value: TValue;
  onValueChange: (value: TValue) => void;
  options: readonly SegmentedControlOption<TValue>[];
  /** グループ自体のラベル。何を切り替えるのかを読み上げる。 */
  ariaLabel: string;
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
}

const sizeClasses = {
  sm: 'min-h-11 px-2 py-1 text-xs',
  md: 'min-h-11 px-4 py-2 text-sm',
} as const;

export function SegmentedControl<TValue extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = 'md',
  className,
}: SegmentedControlProps<TValue>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn(
        'border-border-subtle bg-container inline-flex items-center gap-1 rounded-lg border p-1',
        className,
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            {...(option.ariaLabel ? { 'aria-label': option.ariaLabel } : {})}
            disabled={option.disabled ?? false}
            data-slot="segmented-control-item"
            onClick={() => onValueChange(option.value)}
            className={cn(
              'focus-visible:ring-ring rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50',
              sizeClasses[size],
              isActive
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
