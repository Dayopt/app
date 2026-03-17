'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/toast';
import { ContactDialog } from '@/features/contact';
import {
  EntryDeleteConfirmDialog,
  EntryInspector,
  RecurringEditConfirmDialog,
} from '@/features/entry/components';
import { SettingsDialog } from '@/features/settings';
import { TourOrchestrator } from '@/features/tour';
import { useContactStore } from '@/shell/stores/useContactStore';

import type { StepValidationResult, StepValidators } from '@/features/tour';

/**
 * グローバルオーバーレイ群
 *
 * アプリ全体で共有されるダイアログ・トースト。
 * layout.tsx から分離し、追加/削除を一箇所で管理する。
 */
export function GlobalOverlays() {
  const t = useTranslations();

  // ツアー: ステップバリデーション（現在は空）
  const stepValidators: StepValidators = useMemo(() => ({}), []);

  const handleValidationFail = useCallback(
    (result: StepValidationResult) => {
      if (!result.valid && result.messageKey) {
        toast.info(t(result.messageKey));
      }
    },
    [t],
  );

  const contactOpen = useContactStore((s) => s.isOpen);
  const closeContact = useContactStore((s) => s.close);

  return (
    <>
      <ContactDialog
        open={contactOpen}
        onOpenChange={(open) => {
          if (!open) closeContact();
        }}
      />
      <SettingsDialog />
      <EntryInspector />
      <EntryDeleteConfirmDialog />
      <RecurringEditConfirmDialog />
      <TourOrchestrator stepValidators={stepValidators} onValidationFail={handleValidationFail} />
      <Toaster />
    </>
  );
}
