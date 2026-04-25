'use client';

import { BarChart3, CalendarDays, Sparkles } from 'lucide-react';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface PageNavProps {
  activePage: 'calendar' | 'stats' | 'ai';
  calendarHref: string;
  statsHref: string;
  aiHref: string;
  className?: string;
}

/** ページナビゲーション（Calendar / Stats / AI セグメントコントロール） */
export function PageNav({ activePage, calendarHref, statsHref, aiHref, className }: PageNavProps) {
  const t = useTranslations('sidebar.pageNav');
  const tAria = useTranslations('common.aria');

  return (
    <nav
      className={cn(
        'border-border flex items-center overflow-hidden rounded-full border',
        className,
      )}
      aria-label={tAria('pageNavigation')}
    >
      <Link
        href={calendarHref}
        prefetch
        aria-current={activePage === 'calendar' ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center justify-center gap-2 px-4 text-sm transition-colors',
          activePage === 'calendar'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <CalendarDays className="size-4" />
        <span>{t('calendar')}</span>
      </Link>
      <Link
        href={statsHref}
        prefetch
        aria-current={activePage === 'stats' ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center justify-center gap-2 px-4 text-sm transition-colors',
          activePage === 'stats'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <BarChart3 className="size-4" />
        <span>{t('stats')}</span>
      </Link>
      <Link
        href={aiHref}
        prefetch
        aria-current={activePage === 'ai' ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center justify-center gap-2 px-4 text-sm transition-colors',
          activePage === 'ai'
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-state-hover',
        )}
      >
        <Sparkles className="size-4" />
        <span>{t('ai')}</span>
      </Link>
    </nav>
  );
}
