'use client';

import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { Toaster } from '@/components/ui/feedback/toast';
import { ShortcutCheatSheetDialog } from '@/components/ui/overlays/shortcut-cheat-sheet-dialog';
import {
  CalendarViewType,
  buildCalendarReviewPanelPath,
  buildTimeblockSearchResultPath,
  isCalendarViewPath,
  resolveTimeblockSearchResultDate,
  useCalendarNavigation,
  useShortcutRegistry,
  useTimeblockClipboardStore,
  useTimeblockSearchShortcut,
  type TimeblockSearchResult,
} from '@/features/calendar';
import { useTimeblockInspectorStore, type ClipboardTimeblock } from '@/features/timeblock';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { useShellStore } from '@/lib/stores/useShellStore';
import { toast } from '@/lib/toast';
import { APP_SHORTCUT_CATALOG } from './app-shortcut-catalog';

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

const TimeblockSearchDialog = dynamic(
  () =>
    import('@/features/calendar/components/search/TimeblockSearchDialog').then((m) => ({
      default: m.TimeblockSearchDialog,
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
  useShortcutRegistry();
  useTimeblockSearchShortcut();

  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const calendarNavigation = useCalendarNavigation();
  const timezone = useUserPreferences((preferences) => preferences.timezone);

  const activeSheet = useShellStore.use.activeSheet();
  const closeSheet = useShellStore.use.closeSheet();
  const openTimeblockSearch = useShellStore.use.openTimeblockSearch();
  const closeTimeblockSearch = useShellStore.use.closeTimeblockSearch();
  const contactOpen = activeSheet?.type === 'contact';
  const settingsOpen = activeSheet?.type === 'settings';
  const timeblockSearchOpen = activeSheet?.type === 'timeblockSearch';
  const shortcutCheatSheetOpen = activeSheet?.type === 'shortcutCheatSheet';
  // ShortcutCheatSheetDialog は components/ 配下のため features/calendar の
  // isCalendarViewPath を直接importできない（依存方向違反）。ここで判定して渡す。
  const shortcutActiveScope = isCalendarViewPath(pathname?.replace(/^\/(ja|en)/, '') ?? '')
    ? 'calendar'
    : 'global';
  const isInspectorOpen = useTimeblockInspectorStore((s) => s.isOpen);
  const closeInspector = useTimeblockInspectorStore((s) => s.closeInspector);
  const copyTimeblock = useTimeblockClipboardStore((state) => state.copyTimeblock);

  // shell overlayが開いたら Inspector を閉じる（排他制御）
  useEffect(() => {
    if (settingsOpen || contactOpen || timeblockSearchOpen || shortcutCheatSheetOpen) {
      closeInspector();
    }
  }, [settingsOpen, contactOpen, timeblockSearchOpen, shortcutCheatSheetOpen, closeInspector]);

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

  const handleSearchOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openTimeblockSearch();
      } else {
        closeTimeblockSearch();
      }
    },
    [closeTimeblockSearch, openTimeblockSearch],
  );

  const handleOpenSearchResult = useCallback(
    (result: TimeblockSearchResult) => {
      calendarNavigation?.navigateToDate(
        resolveTimeblockSearchResultDate(result.startAt, timezone),
      );
      router.push(
        buildTimeblockSearchResultPath({
          locale,
          startAt: result.startAt,
          timezone,
          timeblockId: result.id,
          kind: result.kind,
        }),
      );
    },
    [calendarNavigation, locale, router, timezone],
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
      <TimeblockSearchDialog
        open={timeblockSearchOpen}
        onOpenChange={handleSearchOpenChange}
        onOpenResult={handleOpenSearchResult}
      />
      <ShortcutCheatSheetDialog
        open={shortcutCheatSheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        catalog={APP_SHORTCUT_CATALOG}
        activeScope={shortcutActiveScope}
      />
      <TimeblockInspector onViewStats={handleViewStats} onCopy={handleCopy} />
      <Toaster />
    </>
  );
}
