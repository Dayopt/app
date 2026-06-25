'use client';

import { useLocale } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { Toaster } from '@/components/ui/feedback/toast';
import {
  buildCalendarReviewPanelPath,
  isCalendarViewPath,
  useCalendarNavigation,
} from '@/features/calendar';
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
  const calendarNavigation = useCalendarNavigation();

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

  // Inspector は Calendar ビュー専用 — workspace ビュー外への遷移で自動 close。
  // URL は平坦化済み（/day, /week, /Nday）のため isCalendarViewPath で判定する。
  useEffect(() => {
    if (!isInspectorOpen) return;
    const pathWithoutLocale = pathname?.replace(/^\/(ja|en)/, '') ?? '';
    if (!isCalendarViewPath(pathWithoutLocale)) {
      closeInspector();
    }
  }, [pathname, isInspectorOpen, closeInspector]);

  // Inspector → Calendar review panel
  // setPanelKind は writeCalendarUrl(window.history.replaceState) で URL を
  // 同期更新するため、続く closeInspector の URL 同期（entry 削除）が
  // review panel を打ち消さない。router.push の非同期遷移と closeInspector が
  // 競合し「inspector だけ閉じて panel に到達しない」問題を解消する。
  const handleViewStats = useCallback(
    (tagId: string) => {
      if (calendarNavigation) {
        calendarNavigation.setPanelKind('review', { reviewTagId: tagId });
      } else {
        router.push(buildCalendarReviewPanelPath(locale, new Date(), tagId));
      }
      closeInspector();
    },
    [calendarNavigation, closeInspector, router, locale],
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
