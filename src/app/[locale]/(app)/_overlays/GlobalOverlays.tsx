'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/toast';
import { useInlineCreateStore } from '@/features/calendar';
import {
  EntryDeleteConfirmDialog,
  EntryInspector,
  RecurringEditConfirmDialog,
} from '@/features/entry/components';
import { SettingsDialog } from '@/features/settings';
import { TourOrchestrator } from '@/features/tour';

import type { StepValidationResult, StepValidators } from '@/features/tour';

/**
 * グローバルオーバーレイ群
 *
 * アプリ全体で共有されるダイアログ・トースト。
 * layout.tsx から分離し、追加/削除を一箇所で管理する。
 */
export function GlobalOverlays() {
  const t = useTranslations();

  // ツアー: 過去ドラッグステップのバリデーション
  const stepValidators: StepValidators = useMemo(
    () => ({
      'grid-drag-record': () => {
        const pending = useInlineCreateStore.getState().pendingSelection;
        if (!pending) {
          return { valid: false, messageKey: 'tour.pastTimeHint' } as const;
        }
        const selEnd = new Date(pending.date);
        selEnd.setHours(pending.endHour, pending.endMinute);
        return selEnd < new Date()
          ? ({ valid: true } as const)
          : ({ valid: false, messageKey: 'tour.pastTimeHint' } as const);
      },
    }),
    [],
  );

  const handleValidationFail = useCallback(
    (result: StepValidationResult) => {
      if (!result.valid && result.messageKey) {
        toast.info(t(result.messageKey));
      }
    },
    [t],
  );

  return (
    <>
      <SettingsDialog />
      <EntryInspector />
      <EntryDeleteConfirmDialog />
      <RecurringEditConfirmDialog />
      <TourOrchestrator stepValidators={stepValidators} onValidationFail={handleValidationFail} />
      <Toaster />
    </>
  );
}
