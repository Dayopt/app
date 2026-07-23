'use client';

import { useState } from 'react';

import { Button } from '@dayopt/components';
import { useTranslations } from 'next-intl';

import { useTimeblockRecordMutations } from '../../hooks/useTimeblockRecordMutations';

interface RecordPlanButtonProps {
  planId: string;
  beforeRecord: () => Promise<string>;
  onPreparingChange?: ((isPreparing: boolean) => void) | undefined;
  onRecorded?: ((recordId: string) => void) | undefined;
  disabled?: boolean | undefined;
}

/** 過去 Plan を同じ時間帯の Record として記録するワンタップ導線。 */
export function RecordPlanButton({
  planId,
  beforeRecord,
  onPreparingChange,
  onRecorded,
  disabled = false,
}: RecordPlanButtonProps) {
  const t = useTranslations('timeblock.editor');
  const { recordPlan } = useTimeblockRecordMutations();
  const [isPreparing, setIsPreparing] = useState(false);
  const isPending = isPreparing || recordPlan.isPending;

  const handleRecord = () => {
    if (disabled || isPending) return;
    setIsPreparing(true);
    onPreparingChange?.(true);
    void beforeRecord().then(
      (expectedUpdatedAt) => {
        recordPlan.mutate(
          { id: planId, expectedUpdatedAt },
          {
            onSuccess: (record) => onRecorded?.(record.id),
            onSettled: () => {
              setIsPreparing(false);
              onPreparingChange?.(false);
            },
          },
        );
      },
      () => {
        setIsPreparing(false);
        onPreparingChange?.(false);
      },
    );
  };

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleRecord}
      disabled={disabled || isPending}
      aria-busy={isPending}
    >
      {t('recordAsIs')}
    </Button>
  );
}

interface ConfirmDayButtonProps {
  startAt: Date;
  endAt: Date;
  disabled?: boolean | undefined;
}

/** 日ヘッダーに置く、一日の未記録 Plan をまとめて記録する導線。 */
export function ConfirmDayButton({ startAt, endAt, disabled = false }: ConfirmDayButtonProps) {
  const t = useTranslations('timeblock.editor');
  const { confirmDay } = useTimeblockRecordMutations();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() =>
        confirmDay.mutate({ start_at: startAt.toISOString(), end_at: endAt.toISOString() })
      }
      disabled={disabled || confirmDay.isPending}
    >
      {t('confirmDay')}
    </Button>
  );
}
