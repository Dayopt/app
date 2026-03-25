import { format } from 'date-fns';

import type { CalendarViewType } from '@/features/calendar';

export function getLocaleFromPathname(pathname: string | null | undefined): 'ja' | 'en' {
  const segments = pathname?.split('/') ?? [];
  return segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
    ? segments[1]
    : 'ja';
}

export function buildCalendarPath(params: {
  locale: string;
  viewType: CalendarViewType;
  currentDate?: Date | null;
}): string {
  const searchParams = new URLSearchParams();

  if (params.currentDate) {
    searchParams.set('date', format(params.currentDate, 'yyyy-MM-dd'));
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  return `/${params.locale}/calendar/${params.viewType}${query}`;
}

export function buildStatsPath(locale: string, tab: 'review' | 'progress' | 'insights' = 'review') {
  return `/${locale}/stats/${tab}`;
}
