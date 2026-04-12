'use client';

import { useMemo } from 'react';

import { CheckIcon, Clock, Flag } from 'lucide-react';

import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { computeDuration, formatDurationDisplay } from '@/lib/time-utils';
import { cn } from '@/lib/utils';

import { ClockTimePicker } from './ClockTimePicker';
import { useTimeCombobox } from './useTimeCombobox';

export type TimeIconType = 'clock' | 'flag';

interface TimeSelectProps {
  value: string; // HH:MM形式
  onChange: (time: string) => void;
  disabled?: boolean;
  minTime?: string; // 最小時刻（この時刻以降のみ選択可能、HH:MM形式）
  /** 外部からのエラー状態（重複エラーなど） */
  hasError?: boolean;
  /** アイコンを表示するか（デフォルト: false） */
  showIcon?: boolean;
  /** アイコン種別（デフォルト: clock） */
  iconType?: TimeIconType;
  /** ドロップダウン内に duration を表示するか（minTime からの経過時間） */
  showDurationInMenu?: boolean;
}

/**
 * 時刻選択（Google Calendar風）
 * - PC: Popover で15分刻みドロップダウン + 矢印キー ↑↓
 * - モバイル: Drawer + 時計盤ピッカー（Material Design 風）
 * - 手動入力は不可（15分刻み制約）
 */
export function TimeSelect({
  value,
  onChange,
  disabled = false,
  minTime,
  hasError = false,
  showIcon = false,
  iconType = 'clock',
  showDurationInMenu = false,
}: TimeSelectProps) {
  const isMobile = useIsMobile();

  const {
    isOpen,
    highlightedIndex,
    options,
    inputRef,
    listRef,
    handleKeyDown,
    handleFocus,
    handleOptionClick,
    handleOptionHover,
    handleOpenChange,
    handleTriggerClick,
  } = useTimeCombobox({ value, onChange, minTime, isMobile });

  // duration 表示用: options × minTime が変わらない限りキャッシュ
  const durationLabels = useMemo(() => {
    if (!showDurationInMenu || !minTime) return null;
    const map = new Map<string, string>();
    for (const option of options) {
      map.set(option, formatDurationDisplay(computeDuration(minTime, option)));
    }
    return map;
  }, [showDurationInMenu, minTime, options]);

  const iconElement = showIcon ? (
    iconType === 'flag' ? (
      <Flag className="text-muted-foreground size-4 shrink-0" />
    ) : (
      <Clock className="text-muted-foreground size-4 shrink-0" />
    )
  ) : null;

  const triggerClasses = cn(
    'relative flex items-center rounded-lg transition-colors',
    disabled
      ? 'cursor-default'
      : cn('cursor-pointer', hasError ? 'ring-destructive ring-2' : 'hover:bg-state-hover'),
    showIcon && 'w-[72px] gap-2 px-2',
  );

  const inputElement = (
    <input
      ref={inputRef}
      type="text"
      readOnly
      role="combobox"
      aria-expanded={isOpen}
      aria-controls="time-listbox"
      aria-invalid={hasError}
      value={value}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      disabled={disabled}
      placeholder="--:--"
      size={5}
      className={cn(
        'flex h-8 cursor-pointer rounded-lg bg-transparent text-base tabular-nums outline-none',
        'disabled:cursor-default disabled:opacity-50',
        showIcon ? 'w-auto' : 'px-2 text-right',
        value ? 'text-foreground' : 'text-muted-foreground',
        hasError && 'text-destructive',
      )}
    />
  );

  // --- モバイル: Drawer + ClockTimePicker ---
  if (isMobile) {
    return (
      <div>
        <div className={triggerClasses} onClick={disabled ? undefined : handleTriggerClick}>
          {iconElement}
          {inputElement}
        </div>

        {!disabled && (
          <Drawer open={isOpen} onOpenChange={handleOpenChange}>
            <DrawerContent className="z-overlay-popover" overlayClassName="z-overlay-popover">
              <ClockTimePicker
                value={value}
                onChange={onChange}
                onClose={() => handleOpenChange(false)}
                minTime={minTime}
              />
            </DrawerContent>
          </Drawer>
        )}
      </div>
    );
  }

  // --- PC: Popover + スクロールリスト ---
  return (
    <div>
      <Popover open={isOpen} onOpenChange={handleOpenChange} modal={false}>
        <PopoverAnchor asChild>
          <div
            className={triggerClasses}
            onClick={() => {
              if (!isOpen) handleOpenChange(true);
              inputRef.current?.focus();
            }}
          >
            {iconElement}
            {inputElement}
          </div>
        </PopoverAnchor>

        {!disabled && options.length > 0 && (
          <PopoverContent
            className="z-overlay-popover overflow-hidden p-0"
            align="start"
            sideOffset={4}
            style={{
              width: showDurationInMenu && minTime ? '180px' : '120px',
            }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div
              id="time-listbox"
              ref={listRef}
              role="listbox"
              className="scrollbar-thin max-h-52 touch-pan-y overflow-y-auto overscroll-contain px-1 py-1"
              style={{
                scrollbarColor:
                  'color-mix(in oklch, var(--color-muted-foreground) 30%, transparent) transparent',
              }}
            >
              {options.map((option, index) => (
                <button
                  key={option}
                  role="option"
                  aria-selected={option === value}
                  type="button"
                  className={cn(
                    'hover:bg-state-hover w-full rounded-lg px-2 py-2 text-left text-sm transition-colors',
                    index === highlightedIndex
                      ? 'bg-state-selected'
                      : option === value
                        ? 'bg-state-active/10 text-state-active-foreground font-medium'
                        : '',
                  )}
                  onClick={() => handleOptionClick(option)}
                  onMouseEnter={() => handleOptionHover(index)}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{option}</span>
                      {durationLabels && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {durationLabels.get(option)}
                        </span>
                      )}
                    </span>
                    {option === value && <CheckIcon className="text-primary size-4 shrink-0" />}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
