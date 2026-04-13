'use client';

/**
 * 開始時通知設定行
 *
 * icon + label（左） | ReminderToggle（右）
 */

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ReminderToggle } from './ReminderToggle';

interface ReminderRowProps {
  value: boolean;
  onChange: (enabled: boolean) => void;
}

/** Inspectorの開始時通知設定行（アイコン + ラベル + ReminderToggle） */
export function ReminderRow({ value, onChange }: ReminderRowProps) {
  const t = useTranslations();

  return (
    <div className="flex min-h-11 items-center justify-between">
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
