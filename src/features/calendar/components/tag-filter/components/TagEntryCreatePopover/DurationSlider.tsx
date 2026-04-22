'use client';

import { cn } from '@/lib/utils';

interface DurationSliderProps {
  value: number;
  onChange: (minutes: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/**
 * 5-240 分の duration スライダー（5 分刻み）。
 *
 * native range input を使用。ラベルは現在値のみ（分単位、tabular）。
 * アクセシビリティ: input に aria-label、現在値は `[役割=status]` で読み上げ。
 */
export function DurationSlider({
  value,
  onChange,
  min = 5,
  max = 240,
  step = 5,
  className,
}: DurationSliderProps) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="記録時間（分）"
        className="accent-primary bg-muted h-2 w-full cursor-pointer appearance-none rounded-full"
      />
      <span
        role="status"
        aria-live="polite"
        className="text-foreground min-w-14 shrink-0 text-right text-sm tabular-nums"
      >
        {value}分
      </span>
    </div>
  );
}
