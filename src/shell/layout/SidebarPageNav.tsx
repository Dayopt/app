'use client';

import { format } from 'date-fns';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { isCalendarViewPath, useCalendarNavigation } from '@/features/calendar';
import { PageNav } from '@/shell/components/sidebar';
import { useClientRouterStore } from '@/shell/stores/useClientRouterStore';

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

  const locale = useMemo(() => {
    const segments = pathname?.split('/') ?? [];
    if (segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')) {
      return segments[1];
    }
    return 'ja';
  }, [pathname]);

  // clientPage（Zustand）を優先、null（初回/リロード）時は pathname から判定
  const activePage = clientPage ?? getActivePageFromPath(pathname ?? '/');

  const handleCalendarClick = useCallback(() => {
    if (activePage === 'calendar') return;

    const viewType = calendarNav?.viewType ?? 'day';
    const currentDate = calendarNav?.currentDate;
    const params = new URLSearchParams();
    if (currentDate) {
      params.set('date', format(currentDate, 'yyyy-MM-dd'));
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    window.history.pushState(null, '', `/${locale}/calendar/${viewType}${query}`);
    switchToPage('calendar');
  }, [activePage, calendarNav, locale, switchToPage]);

  const handleStatsClick = useCallback(() => {
    if (activePage === 'stats') return;

    window.history.pushState(null, '', `/${locale}/stats/review`);
    switchToPage('stats');
  }, [activePage, locale, switchToPage]);

  return (
    <PageNav
      activePage={activePage}
      onCalendarClick={handleCalendarClick}
      onStatsClick={handleStatsClick}
    />
  );
}
