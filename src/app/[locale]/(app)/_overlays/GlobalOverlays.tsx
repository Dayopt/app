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
import { TourController } from '@/features/tour';

import type { TourStepId, TourStepValidators } from '@/features/tour';

/**
 * グローバルオーバーレイ群
 *
 * アプリ全体で共有されるダイアログ・トースト。
 * layout.tsx から分離し、追加/削除を一箇所で管理する。
 */
export function GlobalOverlays() {
  const t = useTranslations();

  // ツアー: 過去ドラッグステップのバリデーション
  const stepValidators: TourStepValidators = useMemo(
    () => ({
      'grid-drag-record': () => {
        const pending = useInlineCreateStore.getState().pendingSelection;
        if (!pending) return false;
        const selEnd = new Date(pending.date);
        selEnd.setHours(pending.endHour, pending.endMinute);
        return selEnd < new Date();
      },
    }),
    [],
  );

  const handleValidationFail = useCallback(
    (stepId: TourStepId) => {
      if (stepId === 'grid-drag-record') {
        toast.info(t('tour.pastTimeHint'));
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
      <TourController stepValidators={stepValidators} onValidationFail={handleValidationFail} />
      <Toaster />
    </>
  );
}
