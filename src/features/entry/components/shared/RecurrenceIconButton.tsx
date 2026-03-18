'use client';

import { useState } from 'react';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { RecurrenceDialog } from './RecurrenceDialog';

// 繰り返しオプション（value は type 名）
const RECURRENCE_OPTIONS = [
  { value: '', labelKey: 'common.recurrence.none' },
  { value: 'daily', labelKey: 'common.recurrence.daily' },
  { value: 'weekly', labelKey: 'common.recurrence.weekly' },
  { value: 'monthly', labelKey: 'common.recurrence.monthly' },
  { value: 'yearly', labelKey: 'common.recurrence.yearly' },
  { value: 'weekdays', labelKey: 'common.recurrence.weekdays' },
] as const;

interface RecurrenceIconButtonProps {
  recurrenceRule: string | null;
  recurrenceType: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | null;
  onRepeatTypeChange: (type: string) => void;
  onRecurrenceRuleChange: (rule: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 繰り返し設定アイコンボタン
 * ReminderSelectと同じパターンで、アイコン + テキスト表示
 */
export function RecurrenceIconButton({
  recurrenceRule,
  recurrenceType,
  onRepeatTypeChange,
  onRecurrenceRuleChange,
  disabled = false,
  className,
}: RecurrenceIconButtonProps) {
  const t = useTranslations();
  const [showPopover, setShowPopover] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);

  // 繰り返しが設定されているかどうか
  const hasRecurrence = recurrenceRule || (recurrenceType && recurrenceType !== 'none');

  // 表示テキスト
  const displayText = (() => {
    if (recurrenceRule) {
      return t('common.recurrence.custom');
    }
    if (recurrenceType && recurrenceType !== 'none') {
      const option = RECURRENCE_OPTIONS.find((o) => o.value === recurrenceType);
      return option ? t(option.labelKey) : t('common.recurrence.label');
    }
    return null;
  })();

  return (
    <>
      <Popover open={showPopover} onOpenChange={setShowPopover}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'text-muted-foreground data-[state=selected]:text-foreground hover:bg-state-hover hover:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
              className,
            )}
            data-state={hasRecurrence ? 'selected' : undefined}
            aria-label={
              hasRecurrence
                ? t('plan.inspector.recurrence.repeatLabel', { type: displayText ?? '' })
                : t('plan.inspector.recurrence.setRepeat')
            }
          >
            {hasRecurrence ? displayText : t('common.recurrence.none')}
          </button>
        </PopoverTrigger>

        <PopoverContent className="z-overlay-popover w-48 p-1" align="start" sideOffset={4}>
          <div role="menu" aria-label={t('plan.inspector.recurrence.options')}>
            <button
              className="hover:bg-state-hover focus-visible:bg-state-hover flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none"
              onClick={() => {
                onRepeatTypeChange('');
                onRecurrenceRuleChange(null);
                setShowPopover(false);
              }}
              type="button"
              role="menuitem"
            >
              {t('common.recurrence.none')}
              {!hasRecurrence && <Check className="text-primary size-4" />}
            </button>
            <div className="border-border my-1 border-t" />
            {RECURRENCE_OPTIONS.slice(1).map((option) => (
              <button
                key={option.value}
                className="hover:bg-state-hover focus-visible:bg-state-hover flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none"
                onClick={() => {
                  onRepeatTypeChange(option.value);
                  onRecurrenceRuleChange(null);
                  setShowPopover(false);
                }}
                type="button"
                role="menuitem"
              >
                {t(option.labelKey)}
                {recurrenceType === option.value && !recurrenceRule && (
                  <Check className="text-primary size-4" />
                )}
              </button>
            ))}
            <div className="border-border my-1 border-t" />
            <button
              className="hover:bg-state-hover focus-visible:bg-state-hover flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none"
              onClick={() => {
                setShowPopover(false);
                setShowCustomDialog(true);
              }}
              type="button"
              role="menuitem"
            >
              {t('plan.inspector.recurrence.customEllipsis')}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* カスタム繰り返しDialog */}
      <RecurrenceDialog
        open={showCustomDialog}
        onOpenChange={setShowCustomDialog}
        value={recurrenceRule}
        onChange={onRecurrenceRuleChange}
      />
    </>
  );
}
