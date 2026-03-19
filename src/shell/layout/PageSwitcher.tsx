'use client';

import { format } from 'date-fns';
import { BarChart3, CalendarDays } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { HoverTooltip } from '@/components/ui/tooltip';
import { isCalendarViewPath, useCalendarNavigation } from '@/features/calendar';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useClientRouterStore } from '../stores/useClientRouterStore';

interface PageSwitcherProps {
  className?: string;
}

/**
 * ページ切替アイコンタブ（Calendar / Stats）
 *
 * ヘッダー右側に配置し、CalendarとStatsの2セクションを切り替える。
 * pushState + useClientRouterStore でクライアントサイド遷移を行い、
 * サーバーラウンドトリップを回避する。
 */
export function PageSwitcher({ className }: PageSwitcherProps) {
  const tAria = useTranslations('common.aria');
  const pathname = usePathname();
  const calendarNav = useCalendarNavigation();
  const switchToPage = useClientRouterStore((s) => s.switchToPage);

  // locale を pathname から抽出
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

    // CalendarNavigationProvider の状態を保持して URL を構築
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
    <div
      className={cn(
        'border-border flex items-center gap-0.5 rounded-lg border px-1 py-0.5',
        className,
      )}
      role="tablist"
      aria-label={tAria('pageNavigation')}
    >
      <HoverTooltip content={tAria('calendar')} side="bottom">
        <button
          role="tab"
          aria-selected={activePage === 'calendar'}
          aria-label={tAria('calendar')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors',
            activePage === 'calendar'
              ? 'text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
          onClick={handleCalendarClick}
        >
          <CalendarDays className="size-4" strokeWidth={activePage === 'calendar' ? 2.5 : 2} />
        </button>
      </HoverTooltip>
      <HoverTooltip content={tAria('stats')} side="bottom">
        <button
          role="tab"
          aria-selected={activePage === 'stats'}
          aria-label={tAria('stats')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors',
            activePage === 'stats'
              ? 'text-primary'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
          onClick={handleStatsClick}
        >
          <BarChart3 className="size-4" strokeWidth={activePage === 'stats' ? 2.5 : 2} />
        </button>
      </HoverTooltip>
    </div>
  );
}
