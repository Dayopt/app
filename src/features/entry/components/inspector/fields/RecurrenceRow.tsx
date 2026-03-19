'use client';

/**
 * 繰り返し設定行
 *
 * icon + label（左） | RecurrenceIconButton（右）
 */

import { Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { RecurrenceType } from '../../../types/entry';
import { RecurrenceIconButton } from '../../shared/RecurrenceIconButton';

interface RecurrenceRowProps {
  recurrenceRule: string | null;
  recurrenceType: RecurrenceType | null;
  onRepeatTypeChange: (type: string) => void;
  onRecurrenceRuleChange: (rrule: string | null) => void;
}

/** Inspectorの繰り返し設定行（アイコン + ラベル + RecurrenceIconButton） */
export function RecurrenceRow({
  recurrenceRule,
  recurrenceType,
  onRepeatTypeChange,
  onRecurrenceRuleChange,
}: RecurrenceRowProps) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Repeat className="text-muted-foreground size-4 flex-shrink-0" />
        <span className="text-muted-foreground text-sm">{t('common.recurrence.label')}</span>
      </div>
      <div className="-mr-2">
        <RecurrenceIconButton
          recurrenceRule={recurrenceRule}
          recurrenceType={recurrenceType}
          onRepeatTypeChange={onRepeatTypeChange}
          onRecurrenceRuleChange={onRecurrenceRuleChange}
        />
      </div>
    </div>
  );
}
