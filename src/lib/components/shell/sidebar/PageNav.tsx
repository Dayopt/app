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
      className={cn(
        'border-border flex items-center overflow-hidden rounded-full border',
        className,
      )}
      role="tablist"
      aria-label={tAria('pageNavigation')}
    >
      <button
        role="tab"
        aria-selected={activePage === 'calendar'}
        onClick={onCalendarClick}
        className={cn(
          'flex h-8 items-center justify-center gap-2 px-4 text-sm transition-colors',
          activePage === 'calendar'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover',
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
          'flex h-8 items-center justify-center gap-2 px-4 text-sm transition-colors',
          activePage === 'stats'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <BarChart3 className="size-4" />
        <span>{t('stats')}</span>
      </button>
    </div>
  );
}
