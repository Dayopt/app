'use client';

import { useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { Toaster } from '@/components/ui/feedback/toast';
import { useEntryInspectorStore } from '@/features/entry';
import { useShellStore } from '@/lib/stores/useShellStore';

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

/**
 * グローバルオーバーレイ群
 *
 * アプリ全体で共有されるダイアログ・トースト。
 * layout.tsx から分離し、追加/削除を一箇所で管理する。
 */
export function GlobalOverlays() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const activeSheet = useShellStore.use.activeSheet();
  const closeSheet = useShellStore.use.closeSheet();
  const contactOpen = activeSheet?.type === 'contact';
  const settingsOpen = activeSheet?.type === 'settings';
  const isInspectorOpen = useEntryInspectorStore((s) => s.isOpen);
  const closeInspector = useEntryInspectorStore((s) => s.closeInspector);

  // C4: モーダル（Settings/Contact）が開いたら Inspector を閉じる（排他制御）
  useEffect(() => {
    if (settingsOpen || contactOpen) {
      closeInspector();
    }
  }, [settingsOpen, contactOpen, closeInspector]);

  // Inspector は Calendar 配下専用 — /calendar/ 外への遷移で自動 close
  // handleViewStats から close を呼ぶと useInspectorURLSync の URL 同期が
  // router.push を打ち消すため、pathname 変化を契機に close する。
  useEffect(() => {
    if (!isInspectorOpen) return;
    const onCalendarPage = pathname?.includes('/calendar/') ?? false;
    if (!onCalendarPage) {
      closeInspector();
    }
  }, [pathname, isInspectorOpen, closeInspector]);

  // Inspector → タグ詳細ページナビゲーション
  const handleViewStats = useCallback(
    (tagId: string) => {
      router.push(`/${locale}/review/tags/${tagId}`);
    },
    [router, locale],
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
      <Toaster />
    </>
  );
}
