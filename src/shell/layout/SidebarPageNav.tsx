'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { isCalendarViewPath, useCalendarNavigation } from '@/features/calendar';
import { useStatsFilterStore } from '@/features/stats';
import { PageNav } from '@/shell/components/sidebar';
import { useClientRouterStore } from '@/shell/stores/useClientRouterStore';

import { buildCalendarPath, buildStatsPath, getLocaleFromPathname } from './navigation-paths';

function getActivePageFromPath(pathname: string): 'calendar' | 'stats' {
  const segments = pathname.split('/');
  const pathWithoutLocale =
    segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
      ? '/' + segments.slice(2).join('/')
      : pathname;

  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  return 'calendar';
}

/** PageNav にナビゲーションロジックを接続する Composition Layer コンポーネント */
export function SidebarPageNav() {
  const pathname = usePathname();
  const calendarNav = useCalendarNavigation();
  const switchToPage = useClientRouterStore((s) => s.switchToPage);
  // clientPage を直接読むことで、pushState 後の即座のUI更新を実現
  // usePathname() は Next.js のソフトナビゲーション完了まで遅延するため
  const clientPage = useClientRouterStore((s) => s.clientPage);
  const statsGranularity = useStatsFilterStore((s) => s.granularity);
  const statsDate = useStatsFilterStore((s) => s.currentDate);

  const locale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);

  // clientPage（Zustand）を優先、null（初回/リロード）時は pathname から判定
  const activePage = clientPage ?? getActivePageFromPath(pathname ?? '/');

  const handleCalendarClick = useCallback(() => {
    if (activePage === 'calendar') return;

    window.history.pushState(
      null,
      '',
      buildCalendarPath({
        locale,
        viewType: calendarNav?.viewType ?? 'day',
        currentDate: calendarNav?.currentDate,
      }),
    );
    switchToPage('calendar');
  }, [activePage, calendarNav, locale, switchToPage]);

  const handleStatsClick = useCallback(() => {
    if (activePage === 'stats') return;

    window.history.pushState(
      null,
      '',
      buildStatsPath(locale, 'review', { granularity: statsGranularity, date: statsDate }),
    );
    switchToPage('stats');
  }, [activePage, locale, statsGranularity, statsDate, switchToPage]);

  return (
    <PageNav
      activePage={activePage}
      onCalendarClick={handleCalendarClick}
      onStatsClick={handleStatsClick}
    />
  );
}
