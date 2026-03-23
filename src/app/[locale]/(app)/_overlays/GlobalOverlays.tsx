'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/toast';
import { useEntryInspectorStore } from '@/features/entry';
import { EntryInspector } from '@/features/entry/components';
import { TourOrchestrator } from '@/features/tour';
import { useContactStore } from '@/shell/stores/useContactStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

import type { StepValidationResult, StepValidators } from '@/features/tour';

const ContactDialog = dynamic(
  () =>
    import('@/features/contact/components/ContactDialog').then((m) => ({
      default: m.ContactDialog,
    })),
  { ssr: false },
);

const SettingsDialog = dynamic(
  () =>
    import('@/features/settings/components/SettingsDialog').then((m) => ({
      default: m.SettingsDialog,
    })),
  { ssr: false },
);

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

  const contactOpen = useContactStore.use.isOpen();
  const closeContact = useContactStore.use.close();

  const settingsOpen = useSettingsStore((s) => s.isOpen);
  const closeInspector = useEntryInspectorStore((s) => s.closeInspector);

  // C4: モーダル（Settings/Contact）が開いたら Inspector を閉じる（排他制御）
  useEffect(() => {
    if (settingsOpen || contactOpen) {
      closeInspector();
    }
  }, [settingsOpen, contactOpen, closeInspector]);

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
      <TourOrchestrator stepValidators={stepValidators} onValidationFail={handleValidationFail} />
      <Toaster />
    </>
  );
}
