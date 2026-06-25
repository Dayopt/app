import type { CalendarPanelKind, CalendarViewType } from '@/features/calendar';
import { formatCalendarDateParam, isCalendarViewPath } from '@/features/calendar';

type AppMode = 'calendar' | 'review' | 'other';

/**
 * pathname から現在の app モードを判定する。
 *
 * Sidebar の中身を pathname dispatch で切替えるための central point。
 * route group (workspace) は URL に現れないため、判定はパス形状ベースで問題ない。
 * calendar ビューは workspace 直下に平坦化されている（/day, /week, /Nday）。
 * locale prefix / trailing slash / query string に非依存。
 */
export function getModeFromPath(pathname: string | null | undefined): AppMode {
  if (!pathname) return 'other';
  const pathWithoutLocale = pathname.replace(/^\/(ja|en)/, '');
  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  if (pathWithoutLocale === '/review' || pathWithoutLocale.startsWith('/review/')) return 'review';
  return 'other';
}

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
  return `/${params.locale}/${params.viewType}${query}`;
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
  return panelKind;
}
