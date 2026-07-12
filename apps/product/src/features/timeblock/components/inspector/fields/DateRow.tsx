'use client';

/**
 * 日付選択行
 *
 * icon + label（左） | DatePickerPopover ghostボタン（右）
 */

import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DatePickerPopover } from './DatePickerPopover';

interface DateRowProps {
  label: string;
  icon?: LucideIcon;
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  disabled?: boolean;
  /** 選択可能な最小日付 */
  minDate?: Date | undefined;
}

/** Inspectorの日付選択行（アイコン + ラベル + DatePickerPopover） */
export function DateRow({
  label,
  icon: Icon,
  selectedDate,
  onDateChange,
  disabled = false,
  minDate,
}: DateRowProps) {
  const t = useTranslations();

  return (
    <div className="flex min-h-11 items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="text-muted-foreground size-4 flex-shrink-0" />}
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <div className="-mr-2">
        <DatePickerPopover
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          placeholder={t('common.schedule.datePlaceholder')}
          disabled={disabled}
          minDate={minDate}
        />
      </div>
    </div>
  );
}
