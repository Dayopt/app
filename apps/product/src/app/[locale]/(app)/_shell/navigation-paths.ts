import type { CalendarPanelKind, CalendarViewType } from '@/features/calendar';
import { formatCalendarDateParam } from '@/features/calendar';

export function getLocaleFromPathname(pathname: string | null | undefined): 'ja' | 'en' {
  const segments = pathname?.split('/') ?? [];
  return segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
    ? segments[1]
    : 'ja';
}

export function buildCalendarPath(params: {
  locale: string;
  viewType: CalendarViewType;
  currentDate?: Date | null | undefined;
  panelKind?: CalendarPanelKind | null | undefined;
  reviewTagId?: string | null | undefined;
}): string {
  const searchParams = new URLSearchParams();

  if (params.currentDate) {
    searchParams.set('date', formatCalendarDateParam(params.currentDate));
  }
  const normalizedPanel = normalizeCalendarPanel(params.viewType, params.panelKind ?? null);
  if (normalizedPanel) {
    searchParams.set('panel', normalizedPanel);
  }
  if (normalizedPanel === 'review' && params.reviewTagId) {
    searchParams.set('reviewTagId', params.reviewTagId);
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  return `/${params.locale}/calendar/${params.viewType}${query}`;
}

export function buildReviewPath(locale: string, options?: { granularity?: string; date?: Date }) {
  const basePath = `/${locale}/review`;
  if (!options?.granularity && !options?.date) return basePath;

  const params = new URLSearchParams();
  if (options.granularity) params.set('g', options.granularity);
  if (options.date) params.set('d', formatCalendarDateParam(options.date));
  return `${basePath}?${params.toString()}`;
}

function normalizeCalendarPanel(
  viewType: CalendarViewType,
  panelKind: CalendarPanelKind | null,
): CalendarPanelKind | null {
  if (panelKind === 'diff') return viewType === 'day' ? 'diff' : null;
  if (panelKind === 'review') return viewType === 'week' ? 'review' : null;
  return panelKind;
}
