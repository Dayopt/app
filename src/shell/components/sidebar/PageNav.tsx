'use client';

import { BarChart3, CalendarDays } from 'lucide-react';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface PageNavProps {
  activePage: 'calendar' | 'stats';
  onCalendarClick: () => void;
  onStatsClick: () => void;
  className?: string;
}

/** ページナビゲーション（Calendar / Stats セグメントコントロール） */
export function PageNav({ activePage, onCalendarClick, onStatsClick, className }: PageNavProps) {
  const t = useTranslations('sidebar.pageNav');
  const tAria = useTranslations('common.aria');

  return (
    <div
      className={cn('border-border flex items-center rounded-full border', className)}
      role="tablist"
      aria-label={tAria('pageNavigation')}
    >
      <button
        role="tab"
        aria-selected={activePage === 'calendar'}
        onClick={onCalendarClick}
        className={cn(
          'flex h-7 items-center justify-center gap-1.5 rounded-l-full px-3 text-sm transition-colors',
          activePage === 'calendar'
            ? 'bg-primary-state-selected text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover hover:rounded-r-none',
        )}
      >
        <CalendarDays className="size-3.5" />
        <span>{t('calendar')}</span>
      </button>
      <button
        role="tab"
        aria-selected={activePage === 'stats'}
        onClick={onStatsClick}
        className={cn(
          'flex h-7 items-center justify-center gap-1.5 rounded-r-full px-3 text-sm transition-colors',
          activePage === 'stats'
            ? 'bg-primary-state-selected text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover hover:rounded-l-none',
        )}
      >
        <BarChart3 className="size-3.5" />
        <span>{t('stats')}</span>
      </button>
    </div>
  );
}
