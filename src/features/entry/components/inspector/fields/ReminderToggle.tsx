'use client';

/**
 * 開始時通知ON/OFFトグル
 *
 * ブロック開始時に通知するかどうかを切り替える。
 * ON → onChange(0), OFF → onChange(null)
 */

import { Bell, BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { Switch } from '@/lib/components/ui/switch';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { isReminderEnabled } from '@/lib/reminder';
import { cn } from '@/lib/utils';

interface ReminderToggleProps {
  value: number | null;
  onChange: (value: number | null) => void;
  variant?: 'inspector' | 'compact' | 'button' | 'icon';
  disabled?: boolean;
  className?: string;
}

/** 開始時通知ON/OFFトグル（Inspector, Card, Table で使用） */
export function ReminderToggle({
  value,
  onChange,
  variant = 'inspector',
  disabled = false,
  className,
}: ReminderToggleProps) {
  const t = useTranslations();

  const enabled = isReminderEnabled(value);

  const handleToggle = (checked: boolean) => {
    onChange(checked ? 0 : null);
  };

  if (variant === 'icon') {
    const label = enabled
      ? `${t('common.reminder.label')}: ${t('common.reminder.atStart')}`
      : t('common.reminder.label');

    return (
      <HoverTooltip content={label} side="top">
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-8 items-center gap-1 rounded-lg border px-2 transition-colors',
            'hover:bg-state-hover focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            enabled
              ? 'border-border text-foreground'
              : 'text-muted-foreground hover:text-foreground border-transparent',
            className,
          )}
          onClick={() => handleToggle(!enabled)}
          aria-label={label}
        >
          {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </button>
      </HoverTooltip>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'border-border bg-secondary text-secondary-foreground hover:bg-state-hover focus-visible:border-ring focus-visible:ring-ring flex h-9 w-fit items-center gap-2 rounded-lg border px-2 py-0 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onClick={() => handleToggle(!enabled)}
      >
        {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        <span>{enabled ? t('common.reminder.atStart') : t('common.reminder.none')}</span>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 gap-1 px-2',
          enabled ? 'text-foreground' : 'text-muted-foreground',
          className,
        )}
        type="button"
        disabled={disabled}
        onClick={() => handleToggle(!enabled)}
        aria-label={t('common.reminder.label')}
      >
        {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
      </Button>
    );
  }

  // inspector variant
  return (
    <Switch
      checked={enabled}
      onCheckedChange={handleToggle}
      disabled={disabled}
      aria-label={t('common.reminder.label')}
      className={className}
    />
  );
}
