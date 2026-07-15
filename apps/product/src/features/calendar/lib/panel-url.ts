import type { CalendarViewType } from '../types/calendar.types';
import { formatCalendarDateParam } from './date-param';

export function buildCalendarReviewPanelPath(
  locale: string,
  date: Date,
  reviewTagId?: string | null,
  viewType: CalendarViewType = 'week',
): string {
  const params = new URLSearchParams();
  params.set('date', formatCalendarDateParam(date));
  params.set('panel', 'review');
  if (reviewTagId) params.set('reviewTagId', reviewTagId);
  return `/${locale}/${viewType}?${params.toString()}`;
}
