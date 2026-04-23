'use client';

import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from 'lucide-react';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { cn } from '@/lib/utils';

type ActivePage = 'calendar' | 'stats' | 'ai';

interface PageNavProps {
  activePage: ActivePage;
  calendarHref: string;
  statsHref: string;
  aiHref: string;
  className?: string;
}

type NavTab = {
  id: ActivePage;
  label: string;
  icon: LucideIcon;
  href: string;
};

/** ページナビゲーション（Calendar / Stats / AI セグメントコントロール） */
export function PageNav({ activePage, calendarHref, statsHref, aiHref, className }: PageNavProps) {
  const t = useTranslations('sidebar.pageNav');
  const tAria = useTranslations('common.aria');

  const tabs: NavTab[] = [
    { id: 'calendar', label: t('calendar'), icon: CalendarDays, href: calendarHref },
    { id: 'stats', label: t('stats'), icon: BarChart3, href: statsHref },
    { id: 'ai', label: t('ai'), icon: Sparkles, href: aiHref },
  ];

  return (
    <nav className={cn('flex items-center', className)} aria-label={tAria('pageNavigation')}>
      {tabs.map((tab) => {
        const isActive = activePage === tab.id;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch
            aria-label={isActive ? undefined : tab.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-8 items-center justify-center rounded-lg text-sm no-underline',
              'transition-all duration-200 motion-reduce:transition-none',
              'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              isActive
                ? 'bg-muted text-foreground gap-2 px-4 font-medium'
                : 'text-muted-foreground hover:bg-state-hover w-8',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span
              className={cn(
                'overflow-hidden whitespace-nowrap',
                'transition-all duration-200 motion-reduce:transition-none',
                isActive ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0',
              )}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
