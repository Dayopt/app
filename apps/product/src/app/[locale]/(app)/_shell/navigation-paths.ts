import type { CalendarViewType } from '@/features/calendar';
import { formatCalendarDateParam } from '@/features/calendar';

type AppMode = 'calendar' | 'review' | 'other';

/**
 * pathname から現在の app モードを判定する。
 *
 * Sidebar の中身を pathname dispatch で切替えるための central point。
 * route group (modes) は URL に現れないため、判定は prefix ベースで問題ない。
 * locale prefix / trailing slash / query string に非依存。
 */
export function getModeFromPath(pathname: string | null | undefined): AppMode {
  if (!pathname) return 'other';
  if (pathname.includes('/calendar/') || pathname.endsWith('/calendar')) return 'calendar';
  if (pathname.includes('/review/') || pathname.endsWith('/review')) return 'review';
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
}): string {
  const searchParams = new URLSearchParams();

  if (params.currentDate) {
    searchParams.set('date', formatCalendarDateParam(params.currentDate));
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  return `/${params.locale}/calendar/${params.viewType}${query}`;
}

export function buildReviewPath(locale: string, options?: { granularity?: string; date?: Date }) {
  const basePath = `/${locale}/review`;
  if (!options?.granularity && !options?.date) return basePath;

  const params = new URLSearchParams();
  if (options.granularity) params.set('g', options.granularity);
  // ローカル日付で書く（toISOString は UTC 基準のため JST の朝に前日へずれる）
  if (options.date) params.set('d', formatCalendarDateParam(options.date));
  return `${basePath}?${params.toString()}`;
}
