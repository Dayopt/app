'use client';

import { format } from 'date-fns';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { isCalendarViewPath, useCalendarNavigation } from '@/features/calendar';
import { PageNav } from '@/shell/components/sidebar';
import { useClientRouterStore } from '@/shell/stores/useClientRouterStore';

/** PageNav にナビゲーションロジックを接続する Composition Layer コンポーネント */
export function SidebarPageNav() {
  const pathname = usePathname();
  const calendarNav = useCalendarNavigation();
  const switchToPage = useClientRouterStore((s) => s.switchToPage);

  const locale = useMemo(() => {
    const segments = pathname?.split('/') ?? [];
    if (segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')) {
      return segments[1];
    }
    return 'ja';
  }, [pathname]);

  const activePage = useMemo(() => {
    const segments = pathname?.split('/') ?? [];
    const pathWithoutLocale =
      segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
        ? '/' + segments.slice(2).join('/')
        : (pathname ?? '/');

    if (isCalendarViewPath(pathWithoutLocale)) return 'calendar' as const;
    if (pathWithoutLocale.startsWith('/stats')) return 'stats' as const;
    return 'calendar' as const;
  }, [pathname]);

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
