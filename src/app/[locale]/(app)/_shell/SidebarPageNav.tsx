'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { isCalendarViewPath, useCalendarNavigation } from '@/features/calendar';
import { useStatsFilterStore } from '@/features/stats';
import { PageNav } from '@/lib/components/shell/sidebar';

import { buildCalendarPath, buildStatsPath, getLocaleFromPathname } from './navigation-paths';

function getActivePageFromPath(pathname: string): 'calendar' | 'stats' | 'ai' {
  const segments = pathname.split('/');
  const pathWithoutLocale =
    segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
      ? '/' + segments.slice(2).join('/')
      : pathname;

  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  if (pathWithoutLocale.startsWith('/ai')) return 'ai';
  return 'calendar';
}

/** PageNav にナビゲーションロジックを接続する Composition Layer コンポーネント */
export function SidebarPageNav() {
  const pathname = usePathname();
  const calendarNav = useCalendarNavigation();
  const statsGranularity = useStatsFilterStore((s) => s.granularity);
  const statsDate = useStatsFilterStore((s) => s.currentDate);

  const locale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);
  const activePage = getActivePageFromPath(pathname ?? '/');

  const calendarHref = useMemo(
    () =>
      buildCalendarPath({
        locale,
        viewType: calendarNav?.viewType ?? 'day',
        currentDate: calendarNav?.currentDate,
      }),
    [locale, calendarNav?.viewType, calendarNav?.currentDate],
  );

  const statsHref = useMemo(
    () =>
      buildStatsPath(locale, 'review', {
        granularity: statsGranularity,
        date: statsDate,
      }),
    [locale, statsGranularity, statsDate],
  );

  const aiHref = useMemo(() => `/${locale}/ai`, [locale]);

  return (
    <PageNav
      activePage={activePage}
      calendarHref={calendarHref}
      statsHref={statsHref}
      aiHref={aiHref}
      aiBadge="beta"
    />
  );
}
