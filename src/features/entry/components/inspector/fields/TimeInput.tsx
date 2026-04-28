'use client';

import { type FocusEventHandler, type KeyboardEventHandler, useEffect, useState } from 'react';

import { formatHHmm, parseTimeString } from '@/lib/date';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { cn } from '@/lib/utils';

interface TimeInputProps {
  /** HH:mm 文字列。空文字は未設定。 */
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
  /** 重複エラー等の外部エラー状態 */
  hasError?: boolean;
  /** この時刻以前は受け付けない（end > start 制約用、HH:mm）。違反入力は revert される。 */
  minTime?: string;
}

function timeToMinutes(time: string): number {
  const parsed = parseTimeString(time);
  return parsed ? parsed.hour * 60 + parsed.minute : -1;
}

/**
 * 時刻入力（1 分粒度）
 *
 * - **PC**: `<input type="text">` で `HH:mm` を直接タイプ。`parseTimeString` で validation
 * - **Mobile**: `<input type="time" step="60">` で OS 標準 picker（1 分粒度）
 *
 * dropdown / popover / drawer は持たない。1 分粒度の policy は
 * `INSPECTOR_TIME_PRECISION_MINUTES` (= 1) に固定。
 *
 * @see docs/design/timeline-precision-redesign/overview.md
 */
export function TimeInput({
  value,
  onChange,
  disabled = false,
  hasError = false,
  minTime,
}: TimeInputProps) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const baseClasses = cn(
    'flex h-8 rounded-lg bg-transparent px-2 text-base tabular-nums outline-none transition-colors',
    'disabled:cursor-default disabled:opacity-50',
    hasError ? 'text-destructive ring-destructive ring-2' : 'hover:bg-state-hover',
  );

  if (isMobile) {
    return (
      <input
        type="time"
        step={60}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) return;
          if (minTime && timeToMinutes(next) <= timeToMinutes(minTime)) return;
          onChange(next);
        }}
        disabled={disabled}
        aria-invalid={hasError}
        className={cn(baseClasses, 'cursor-text')}
      />
    );
  }

  const commitDraft = () => {
    if (draft === value) return;
    const parsed = parseTimeString(draft);
    if (!parsed) {
      setDraft(value);
      return;
    }
    const formatted = formatHHmm(parsed.hour, parsed.minute);
    if (minTime && timeToMinutes(formatted) <= timeToMinutes(minTime)) {
      setDraft(value);
      return;
    }
    setDraft(formatted);
    if (formatted !== value) {
      onChange(formatted);
    }
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = () => {
    commitDraft();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-invalid={hasError}
      placeholder="--:--"
      size={5}
      className={cn(
        baseClasses,
        'cursor-text text-right',
        value || draft ? 'text-foreground' : 'text-muted-foreground',
      )}
    />
  );
}
