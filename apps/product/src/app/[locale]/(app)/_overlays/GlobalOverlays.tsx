'use client';

import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { Toaster } from '@/components/ui/feedback/toast';
import {
  CalendarViewType,
  buildCalendarReviewPanelPath,
  isCalendarViewPath,
  useCalendarNavigation,
  useTimeblockClipboardStore,
} from '@/features/calendar';
import type { ClipboardTimeblock } from '@/features/timeblock';
import { useTimeblockInspectorStore } from '@/features/timeblock';
import { useShellStore } from '@/lib/stores/useShellStore';
import { toast } from '@/lib/toast';

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

const TimeblockInspector = dynamic(
  () =>
    import('@/features/timeblock/components/editor/TimeblockInspector').then((m) => ({
      default: m.TimeblockInspector,
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
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const calendarNavigation = useCalendarNavigation();

  const activeSheet = useShellStore.use.activeSheet();
  const closeSheet = useShellStore.use.closeSheet();
  const contactOpen = activeSheet?.type === 'contact';
  const settingsOpen = activeSheet?.type === 'settings';
  const isInspectorOpen = useTimeblockInspectorStore((s) => s.isOpen);
  const closeInspector = useTimeblockInspectorStore((s) => s.closeInspector);
  const copyTimeblock = useTimeblockClipboardStore((s) => s.copyTimeblock);

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
      const pathWithoutLocale = pathname?.replace(/^\/(ja|en)/, '') ?? '';
      const currentViewSegment = pathWithoutLocale.split('/')[1]?.split('?')[0] ?? '';
      const fallbackView: CalendarViewType = isCalendarViewPath(pathWithoutLocale)
        ? currentViewSegment === 'day' ||
          currentViewSegment === 'week' ||
          /^\d+day$/.test(currentViewSegment)
          ? (currentViewSegment as CalendarViewType)
          : 'week'
        : 'week';
      if (calendarNavigation) {
        calendarNavigation.setPanelKind('review', { reviewTagId: tagId });
      } else {
        router.push(buildCalendarReviewPanelPath(locale, new Date(), tagId, fallbackView));
      }
      closeInspector();
    },
    [calendarNavigation, closeInspector, pathname, router, locale],
  );

  const handleCopy = useCallback(
    (timeblock: ClipboardTimeblock) => {
      copyTimeblock(timeblock);
      toast.success(t('common.toast.copied'));
    },
    [copyTimeblock, t],
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
      <TimeblockInspector onViewStats={handleViewStats} onCopy={handleCopy} />
      <Toaster />
    </>
  );
}
