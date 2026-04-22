'use client';

import { toast } from '@/lib/toast';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

import { useEntryInspectorStore } from '@/features/entry';
import { Toaster } from '@/lib/components/ui/toast';
import { useShellStore } from '@/lib/stores/useShellStore';

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

const EntryInspector = dynamic(
  () =>
    import('@/features/entry/components/inspector/EntryInspector').then((m) => ({
      default: m.EntryInspector,
    })),
  { ssr: false },
);

const TourOrchestrator = dynamic(
  () =>
    import('@/features/tour/components/TourOrchestrator').then((m) => ({
      default: m.TourOrchestrator,
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
  const locale = useLocale();
  const router = useRouter();

  // ツアー: ステップバリデーション（現在は空）
  const stepValidators: StepValidators = useMemo(() => ({}), []);

  const handleValidationFail = useCallback(
    (result: StepValidationResult) => {
      if (!result.valid && result.messageKey) {
        toast.error(t(result.messageKey));
      }
    },
    [t],
  );

  const activeSheet = useShellStore.use.activeSheet();
  const closeSheet = useShellStore.use.closeSheet();
  const contactOpen = activeSheet?.type === 'contact';
  const settingsOpen = activeSheet?.type === 'settings';
  const closeInspector = useEntryInspectorStore((s) => s.closeInspector);

  // C4: モーダル（Settings/Contact）が開いたら Inspector を閉じる（排他制御）
  useEffect(() => {
    if (settingsOpen || contactOpen) {
      closeInspector();
    }
  }, [settingsOpen, contactOpen, closeInspector]);

  // Inspector → タグ詳細ページナビゲーション
  const handleViewStats = useCallback(
    (tagId: string) => {
      closeInspector();
      router.push(`/${locale}/stats/tags/${tagId}`);
    },
    [router, locale, closeInspector],
  );

  return (
    <>
      <ContactDialog
        open={contactOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      />
      <SettingsDialog />
      <EntryInspector onViewStats={handleViewStats} />
      <TourOrchestrator stepValidators={stepValidators} onValidationFail={handleValidationFail} />
      <Toaster />
    </>
  );
}
