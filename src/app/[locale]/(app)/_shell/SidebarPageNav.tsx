'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { isCalendarViewPath, useCalendarNavigation } from '@/features/calendar';
import { useStatsFilterStore } from '@/features/stats';
import { PageNav } from '@/lib/components/shell/sidebar';

import { buildCalendarPath, buildReviewPath, getLocaleFromPathname } from './navigation-paths';

function getActivePageFromPath(pathname: string): 'calendar' | 'review' {
  const segments = pathname.split('/');
  const pathWithoutLocale =
    segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
      ? '/' + segments.slice(2).join('/')
      : pathname;

  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  if (pathWithoutLocale.startsWith('/review')) return 'review';
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

  const reviewHref = useMemo(
    () =>
      buildReviewPath(locale, {
        granularity: statsGranularity,
        date: statsDate,
      }),
    [locale, statsGranularity, statsDate],
  );

  return <PageNav activePage={activePage} calendarHref={calendarHref} reviewHref={reviewHref} />;
}
