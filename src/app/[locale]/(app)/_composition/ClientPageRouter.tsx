'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { isCalendarViewPath } from '@/features/calendar';
import type { StatsTab } from '@/features/stats';
import { StatsPageContent } from '@/features/stats';
import { SidebarPageNav } from '@/shell/layout/SidebarPageNav';
import { useClientRouterStore } from '@/shell/stores/useClientRouterStore';

import { CalendarViewClient } from '../calendar/_composition/CalendarViewClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripLocale(pathname: string): string {
  const segments = pathname.split('/');
  return segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
    ? '/' + segments.slice(2).join('/')
    : pathname;
}

function getPageType(pathname: string): 'calendar' | 'stats' | null {
  const pathWithoutLocale = stripLocale(pathname);

  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  return null;
}

// ---------------------------------------------------------------------------
// Sub-views (client-side rendered)
// ---------------------------------------------------------------------------

function CalendarClientView() {
  const t = useTranslations();

  const translations = useMemo(
    () => ({
      errorTitle: t('calendar.errors.loadFailed'),
      errorMessage: t('calendar.errors.displayFailed'),
      reloadButton: t('common.reload'),
    }),
    [t],
  );

  return <CalendarViewClient translations={translations} />;
}

const VALID_STATS_TABS: StatsTab[] = ['review', 'progress', 'insights'];

function extractStatsTab(pathname: string): StatsTab {
  const pathWithoutLocale = stripLocale(pathname);
  const segments = pathWithoutLocale.split('/');
  // /stats/overview → segments = ['', 'stats', 'overview']
  const tab = segments[2];
  if (tab && (VALID_STATS_TABS as string[]).includes(tab)) {
    return tab as StatsTab;
  }
  return 'review';
}

function StatsClientView({ pathname }: { pathname: string }) {
  const tab = extractStatsTab(pathname);
  return <StatsPageContent tab={tab} headerRightExtra={<SidebarPageNav />} />;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ClientPageRouterProps {
  children: React.ReactNode;
}

/**
 * クライアントサイドページ切り替え
 *
 * 初回ロード / リロード時は Next.js が SSR した {children} をそのまま表示。
 * PageNav が pushState + useClientRouterStore.switchToPage() を呼ぶと、
 * CalendarViewClient / StatsPageContent をクライアントサイドで直接レンダリングする。
 *
 * これにより router.push() のサーバーラウンドトリップを回避し、
 * ChatGPT ライクな「Sidebar 静止 / メインのみ切り替え」体験を実現する。
 */
export function ClientPageRouter({ children }: ClientPageRouterProps) {
  const pathname = usePathname() ?? '/';
  const clientPage = useClientRouterStore((s) => s.clientPage);
  const switchToPage = useClientRouterStore((s) => s.switchToPage);
  const resetToServer = useClientRouterStore((s) => s.resetToServer);

  // ブラウザ戻る/進む時: popstate イベントで clientPage を同期
  // pathname の useEffect ではなく popstate を直接リスンすることで、
  // pushState による遷移（PageNav）と区別し race condition を防ぐ
  useEffect(() => {
    const handlePopState = () => {
      const pageType = getPageType(window.location.pathname);
      if (pageType === 'calendar' || pageType === 'stats') {
        switchToPage(pageType);
      } else {
        resetToServer();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [switchToPage, resetToServer]);

  if (clientPage === 'calendar') {
    return <CalendarClientView />;
  }

  if (clientPage === 'stats') {
    return <StatsClientView pathname={pathname} />;
  }

  return <>{children}</>;
}
