'use client';

import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/toast';
import { useEntryInspectorStore } from '@/features/entry';
import { usePaletteItems, usePaletteMutations } from '@/features/palette';
import { useClientRouterStore } from '@/shell/stores/useClientRouterStore';
import { useShellStore } from '@/shell/stores/useShellStore';

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
  const resetToServer = useClientRouterStore((s) => s.resetToServer);

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

  // Inspector → パレット連携（feature 間の接続は Composition Layer で行う）
  const { pinItem, unpinItem } = usePaletteMutations();
  const { data: paletteItems } = usePaletteItems();

  const handlePinToPalette = useCallback(
    (tagId: string, durationMinutes: number) => {
      pinItem(tagId, durationMinutes);
      toast.success(t('common.actions.addedToPalette'));
    },
    [pinItem, t],
  );

  const handleUnpinFromPalette = useCallback(
    (tagId: string, durationMinutes: number) => {
      if (!paletteItems) return;
      const item = paletteItems.find(
        (i) => i.tag_id === tagId && i.duration_minutes === durationMinutes,
      );
      if (!item) return;
      unpinItem(item.id);
      toast.success(t('common.actions.removedFromPalette'));
    },
    [paletteItems, unpinItem, t],
  );

  const checkIsPinned = useCallback(
    (tagId: string, durationMinutes: number) => {
      if (!paletteItems) return false;
      return paletteItems.some(
        (item) => item.tag_id === tagId && item.duration_minutes === durationMinutes,
      );
    },
    [paletteItems],
  );

  // Inspector → タグ詳細ページナビゲーション
  const handleViewStats = useCallback(
    (tagId: string) => {
      resetToServer();
      router.push(`/${locale}/stats/tags/${tagId}`);
    },
    [router, locale, resetToServer],
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
      <EntryInspector
        onPinToPalette={handlePinToPalette}
        onUnpinFromPalette={handleUnpinFromPalette}
        isPinnedInPalette={checkIsPinned}
        onViewStats={handleViewStats}
      />
      <TourOrchestrator stepValidators={stepValidators} onValidationFail={handleValidationFail} />
      <Toaster />
    </>
  );
}
