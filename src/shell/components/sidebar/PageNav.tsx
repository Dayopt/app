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

/** サイドバー上部のページナビゲーション（Calendar / Stats セグメントコントロール） */
export function PageNav({ activePage, onCalendarClick, onStatsClick, className }: PageNavProps) {
  const t = useTranslations('sidebar.pageNav');
  const tAria = useTranslations('common.aria');

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="tablist"
      aria-label={tAria('pageNavigation')}
    >
      <button
        role="tab"
        aria-selected={activePage === 'calendar'}
        onClick={onCalendarClick}
        className={cn(
          'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-colors',
          'hover:bg-state-hover',
          activePage === 'calendar'
            ? 'bg-state-selected text-foreground font-medium'
            : 'text-muted-foreground',
        )}
      >
        <CalendarDays className="size-4" />
        <span>{t('calendar')}</span>
      </button>
      <button
        role="tab"
        aria-selected={activePage === 'stats'}
        onClick={onStatsClick}
        className={cn(
          'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-colors',
          'hover:bg-state-hover',
          activePage === 'stats'
            ? 'bg-state-selected text-foreground font-medium'
            : 'text-muted-foreground',
        )}
      >
        <BarChart3 className="size-4" />
        <span>{t('stats')}</span>
      </button>
    </div>
  );
}
