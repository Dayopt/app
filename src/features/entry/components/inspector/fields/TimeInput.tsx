'use client';

import { type FocusEventHandler, type KeyboardEventHandler, useEffect, useState } from 'react';

import { Drawer, DrawerContent } from '@/lib/components/ui/drawer';
import { formatHHmm, parseTimeString } from '@/lib/date';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { cn } from '@/lib/utils';

import { ClockTimePicker } from './ClockTimePicker';

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

const ARROW_STEP_MINUTES = 15;

function timeToMinutes(time: string): number {
  const parsed = parseTimeString(time);
  return parsed ? parsed.hour * 60 + parsed.minute : -1;
}

function shiftTime(time: string, deltaMinutes: number): string | null {
  const parsed = parseTimeString(time);
  if (!parsed) return null;
  const total = (parsed.hour * 60 + parsed.minute + deltaMinutes + 24 * 60) % (24 * 60);
  return formatHHmm(Math.floor(total / 60), total % 60);
}

/**
 * 時刻入力（1 分粒度）
 *
 * - **PC**: `<input type="text">` で `HH:mm` を直接タイプ。`parseTimeString` で validation。
 *   focus 中の `↑`/`↓` で ±15 分 step（GCal 風）
 * - **Mobile**: タップで Drawer + 時計盤ピッカー（1 分粒度、drag で連続調整可）
 *
 * 1 分粒度の policy は `INSPECTOR_TIME_PRECISION_MINUTES` (= 1) に固定。
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
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const baseClasses = cn(
    'flex h-8 rounded-lg bg-transparent px-2 text-base tabular-nums outline-none transition-colors',
    'disabled:cursor-default disabled:opacity-50',
    hasError ? 'text-destructive ring-destructive ring-2' : 'hover:bg-state-hover',
  );

  if (isMobile) {
    const triggerLabel = value || '--:--';
    return (
      <>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          aria-label={value ? `${value} を編集` : '時刻を入力'}
          className={cn(
            baseClasses,
            'cursor-pointer text-right',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {triggerLabel}
        </button>
        {!disabled && (
          <Drawer open={pickerOpen} onOpenChange={setPickerOpen}>
            <DrawerContent className="z-overlay-popover" overlayClassName="z-overlay-popover">
              <ClockTimePicker
                value={value || '09:00'}
                onChange={onChange}
                onClose={() => setPickerOpen(false)}
                minTime={minTime}
              />
            </DrawerContent>
          </Drawer>
        )}
      </>
    );
  }

  const tryCommit = (formatted: string): boolean => {
    if (minTime && timeToMinutes(formatted) <= timeToMinutes(minTime)) {
      return false;
    }
    setDraft(formatted);
    if (formatted !== value) {
      onChange(formatted);
    }
    return true;
  };

  const commitDraft = () => {
    if (draft === value) return;
    const parsed = parseTimeString(draft);
    if (!parsed) {
      setDraft(value);
      return;
    }
    const formatted = formatHHmm(parsed.hour, parsed.minute);
    if (!tryCommit(formatted)) {
      setDraft(value);
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
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseTimeString(draft) ? draft : value;
      if (!base) return;
      const next = shiftTime(base, e.key === 'ArrowUp' ? ARROW_STEP_MINUTES : -ARROW_STEP_MINUTES);
      if (next) tryCommit(next);
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
