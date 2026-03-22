'use client';

/**
 * リマインダー設定行
 *
 * icon + label（左） | ReminderToggle（右）
 */

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ReminderToggle } from './ReminderToggle';

interface ReminderRowProps {
  value: number | null;
  onChange: (minutes: number | null) => void;
}

/** Inspectorのリマインダー設定行（アイコン + ラベル + ReminderToggle） */
export function ReminderRow({ value, onChange }: ReminderRowProps) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Bell className="text-muted-foreground size-4 flex-shrink-0" />
        <span className="text-muted-foreground text-sm">{t('common.reminder.label')}</span>
      </div>
      <div className="-mr-2">
        <ReminderToggle value={value} onChange={onChange} variant="inspector" />
      </div>
    </div>
  );
}
