'use client';

import {
  type FocusEventHandler,
  type KeyboardEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CheckIcon } from 'lucide-react';

import {
  computeDuration,
  formatDurationMinutes,
  formatHHmm,
  formatTimeString,
  parseTimeString,
} from '@/lib/date';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import {
  cn,
  Drawer,
  DrawerContent,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@dayopt/components';

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
  /** E2E/アクセシビリティ確認用の安定セレクタ */
  testId?: string | undefined;
}

const PRESET_STEP_MINUTES = 15;

/** 15 分刻みの 24 時間プリセット（00:00 〜 23:45） */
const PRESET_OPTIONS: readonly string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += PRESET_STEP_MINUTES) {
      out.push(formatHHmm(h, m));
    }
  }
  return out;
})();

function timeToMinutes(time: string): number {
  const parsed = parseTimeString(time);
  return parsed ? parsed.hour * 60 + parsed.minute : -1;
}

/**
 * 時刻入力（1 分粒度）
 *
 * - **PC**: `<input type="text">` で `HH:mm` を直接タイプ。focus / click で 15 分プリセット dropdown を開く。
 *   end input では minTime からの duration を併記。
 *   矢印キー: dropdown が開いている時のみ list 内 highlight 移動（closed 時は何もしない）
 * - **Mobile**: タップで Drawer + 時計盤ピッカー（1 分粒度、drag で連続調整可）
 *
 * @see docs/projects/timeline-precision-redesign/overview.md
 */
export function TimeInput({
  value,
  onChange,
  disabled = false,
  hasError = false,
  minTime,
  testId,
}: TimeInputProps) {
  const isMobile = useIsMobile();
  const timeFormat = useUserPreferences((s) => s.timeFormat);
  const [draft, setDraft] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  /**
   * preset 選択 / Enter+highlight で明示的に commit した直後の blur 時に
   * commitDraft が古い draft で再 commit するのを防ぐ（Codex P1）
   */
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    // 上流から不正値（NaN:NaN 等）が来た時に input が崩れるのを防ぐ防御層
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 上流の不正値からの recovery
    setDraft(value === '' || parseTimeString(value) ? value : '');
  }, [value]);

  const filteredOptions = useMemo(
    () =>
      minTime
        ? PRESET_OPTIONS.filter((opt) => timeToMinutes(opt) > timeToMinutes(minTime))
        : PRESET_OPTIONS,
    [minTime],
  );

  // popover 開いた時に現在値の近辺へスクロール
  useEffect(() => {
    if (!popoverOpen || hasScrolledRef.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        const targetTime = parseTimeString(draft) ? draft : value;
        let targetIndex = filteredOptions.indexOf(targetTime);
        if (targetIndex === -1) {
          // 近接する 15 分境界を探す
          const targetMin = timeToMinutes(targetTime);
          if (targetMin >= 0) {
            const rounded = Math.floor(targetMin / PRESET_STEP_MINUTES) * PRESET_STEP_MINUTES;
            const candidate = formatHHmm(Math.floor(rounded / 60), rounded % 60);
            targetIndex = filteredOptions.indexOf(candidate);
          }
        }
        if (targetIndex === -1) targetIndex = 0;
        const itemHeight = 36;
        list.scrollTop = targetIndex * itemHeight - list.clientHeight / 2 + itemHeight / 2;
        hasScrolledRef.current = true;
      });
    });
  }, [popoverOpen, draft, value, filteredOptions]);

  const baseClasses = cn(
    'flex h-8 items-center rounded-lg bg-transparent px-2 text-base tabular-nums leading-none outline-none transition-colors',
    'disabled:cursor-default disabled:opacity-50',
    hasError ? 'text-destructive ring-destructive ring-2' : 'hover:bg-state-hover',
  );

  if (isMobile) {
    const triggerLabel = value || '--:--';
    return (
      <>
        <button
          type="button"
          data-testid={testId}
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
            <DrawerContent className="z-overlay-popover">
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

  // ─── PC: input + popover dropdown ────────────────────

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

  /** 上流の value が不正なら "" にフォールバック（useEffect の sanitizer と整合） */
  const safeValue = parseTimeString(value) ? value : '';

  const commitDraft = () => {
    if (draft === value) return;
    const parsed = parseTimeString(draft);
    if (!parsed) {
      setDraft(safeValue);
      return;
    }
    const formatted = formatHHmm(parsed.hour, parsed.minute);
    if (!tryCommit(formatted)) {
      setDraft(safeValue);
    }
  };

  const openPopover = () => {
    if (popoverOpen) return;
    hasScrolledRef.current = false;
    setHighlightedIndex(-1);
    setPopoverOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      hasScrolledRef.current = false;
      setHighlightedIndex(-1);
    }
    setPopoverOpen(open);
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = (e) => {
    // popover 内クリック中は blur をスルー（PopoverContent が次フォーカス先）
    const next = e.relatedTarget as HTMLElement | null;
    if (next && listRef.current?.contains(next)) return;
    // preset 選択直後は draft が stale で再 commit すると古い値で上書きされるため skip
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      handleOpenChange(false);
      return;
    }
    commitDraft();
    handleOpenChange(false);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (popoverOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        const picked = filteredOptions[highlightedIndex]!;
        skipBlurCommitRef.current = true;
        tryCommit(picked);
        handleOpenChange(false);
      }
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      handleOpenChange(false);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' && popoverOpen) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp' && popoverOpen) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    }
  };

  const handlePresetSelect = (option: string) => {
    skipBlurCommitRef.current = true;
    tryCommit(option);
    handleOpenChange(false);
    inputRef.current?.blur();
  };

  const renderOptionLabel = (option: string): string => {
    const parsed = parseTimeString(option);
    if (!parsed) return option;
    return formatTimeString(parsed.hour, parsed.minute, timeFormat);
  };

  const minTimeMinutes = minTime ? timeToMinutes(minTime) : -1;

  return (
    <Popover open={popoverOpen && !disabled} onOpenChange={handleOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          data-testid={testId}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={openPopover}
          onClick={openPopover}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-invalid={hasError}
          aria-expanded={popoverOpen}
          aria-controls="time-input-listbox"
          role="combobox"
          placeholder="--:--"
          size={5}
          className={cn(
            baseClasses,
            'cursor-text text-right',
            value || draft ? 'text-foreground' : 'text-muted-foreground',
          )}
        />
      </PopoverAnchor>
      <PopoverContent
        className="z-overlay-popover overflow-hidden p-0"
        align="start"
        sideOffset={4}
        style={{ width: minTime ? '180px' : '120px' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          id="time-input-listbox"
          ref={listRef}
          role="listbox"
          className="max-h-52 touch-pan-y scrollbar-thin overflow-y-auto overscroll-contain px-1 py-1"
          style={{
            scrollbarColor:
              'color-mix(in oklch, var(--color-muted-foreground) 30%, transparent) transparent',
          }}
        >
          {filteredOptions.map((option, index) => {
            const isCurrent = option === value;
            const isHighlighted = index === highlightedIndex;
            const durationMinutes =
              minTime && minTimeMinutes >= 0 ? computeDuration(minTime, option) : 0;
            const durationLabel = durationMinutes > 0 ? formatDurationMinutes(durationMinutes) : '';
            return (
              <button
                key={option}
                role="option"
                aria-selected={isCurrent}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePresetSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'hover:bg-state-hover w-full rounded-lg px-2 py-2 text-left text-sm transition-colors',
                  isHighlighted && 'bg-state-selected',
                  !isHighlighted &&
                    isCurrent &&
                    'bg-state-active/10 text-state-active-foreground font-medium',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{renderOptionLabel(option)}</span>
                    {durationLabel && (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {durationLabel}
                      </span>
                    )}
                  </span>
                  {isCurrent && <CheckIcon className="text-primary size-4 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
