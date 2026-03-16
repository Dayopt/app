'use client';

import { useState } from 'react';

import { Bell, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverTooltip } from '@/components/ui/tooltip';
import { getReminderI18nKey, REMINDER_OPTIONS } from '@/lib/reminder';
import { cn } from '@/lib/utils';

interface ReminderSelectProps {
  value: number | null;
  onChange: (value: number | null) => void;
  variant?: 'inspector' | 'compact' | 'button' | 'icon';
  disabled?: boolean;
  className?: string;
}

/**
 * Reminder select component (Button + Popover)
 *
 * Used across Inspector, Card, and Table views
 * - inspector: Wide style with Bell + text
 * - compact: Compact style with Bell icon only
 * - button: Standard button style for Card/Table popovers
 * - icon: Icon-only style
 *
 * Uses Radix Popover (via Portal) for correct display inside Inspector
 */
export function ReminderSelect({
  value,
  onChange,
  variant = 'inspector',
  disabled = false,
  className,
}: ReminderSelectProps) {
  const t = useTranslations();
  const [showPopover, setShowPopover] = useState(false);

  const hasReminder = value !== null;

  const getDisplayLabel = () => {
    return t(getReminderI18nKey(value));
  };

  const triggerButton = (() => {
    if (variant === 'button') {
      return (
        <button
          type="button"
          disabled={disabled}
          className="border-border bg-secondary text-secondary-foreground hover:bg-state-hover focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-fit items-center gap-1 rounded-lg border px-2 py-0 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{getDisplayLabel()}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 opacity-50"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      );
    }

    if (variant === 'inspector') {
      return (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'text-muted-foreground data-[state=selected]:text-foreground hover:bg-state-hover hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          data-state={hasReminder ? 'selected' : undefined}
        >
          {hasReminder ? getDisplayLabel() : t('common.reminder.add')}
        </button>
      );
    }

    if (variant === 'icon') {
      const label = hasReminder
        ? `${t('common.reminder.label')}: ${getDisplayLabel()}`
        : t('common.reminder.label');
      return (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-8 items-center gap-1 rounded-lg border px-2 transition-colors',
            'hover:bg-state-hover focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            hasReminder
              ? 'border-border text-foreground'
              : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
          aria-label={label}
        >
          <Bell className="size-4" />
          {hasReminder && <span className="text-sm">{getDisplayLabel()}</span>}
        </button>
      );
    }

    // compact variant
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 gap-1 px-2 ${hasReminder ? 'text-foreground' : 'text-muted-foreground'}`}
        type="button"
        disabled={disabled}
        aria-label={t('common.reminder.label')}
      >
        <Bell className="h-4 w-4" />
      </Button>
    );
  })();

  const popoverTrigger = <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>;

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      {variant === 'icon' ? (
        <HoverTooltip
          content={
            hasReminder
              ? `${t('common.reminder.label')}: ${getDisplayLabel()}`
              : t('common.reminder.label')
          }
          side="top"
        >
          {popoverTrigger}
        </HoverTooltip>
      ) : (
        popoverTrigger
      )}
      <PopoverContent className="z-overlay-popover w-56 p-1" align="start" sideOffset={4}>
        {REMINDER_OPTIONS.map((option, index) => (
          <div key={option.i18nKey}>
            {index === 1 && <div className="border-border my-1 border-t" />}
            <button
              className="hover:bg-state-hover flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm"
              onClick={() => {
                onChange(option.minutes);
                setShowPopover(false);
              }}
              type="button"
            >
              {t(option.i18nKey)}
              {value === option.minutes && <Check className="text-primary h-4 w-4" />}
            </button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
