'use client';

import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { HoverTooltip } from '@/lib/components/ui/tooltip';
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

  // クリックでアクティブタブが変わると隣接タブの位置がずれ、cursor 下に来た別タブの
  // mouseenter が発火して誤ったツールチップが出る。click 直後の短時間だけ nav 全体を
  // pointer-events-none にして hover トリガを抑止する。
  const [suppressHover, setSuppressHover] = useState(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    };
  }, []);

  const handleTabClick = useCallback(() => {
    setSuppressHover(true);
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    suppressTimeoutRef.current = setTimeout(() => setSuppressHover(false), 400);
  }, []);

  const tabs: NavTab[] = [
    { id: 'calendar', label: t('calendar'), icon: CalendarDays, href: calendarHref },
    { id: 'stats', label: t('stats'), icon: BarChart3, href: statsHref },
    { id: 'ai', label: t('ai'), icon: Sparkles, href: aiHref },
  ];

  return (
    <nav
      className={cn('flex items-center', suppressHover && 'pointer-events-none', className)}
      aria-label={tAria('pageNavigation')}
    >
      {tabs.map((tab) => {
        const isActive = activePage === tab.id;
        const Icon = tab.icon;
        return (
          <HoverTooltip
            key={`${tab.id}-${activePage}`}
            content={tab.label}
            side="bottom"
            disabled={isActive || suppressHover}
          >
            <Link
              href={tab.href}
              prefetch
              onClick={handleTabClick}
              aria-label={isActive ? undefined : tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center justify-center rounded-lg text-sm no-underline',
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
                  isActive ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0',
                )}
              >
                {tab.label}
              </span>
            </Link>
          </HoverTooltip>
        );
      })}
    </nav>
  );
}
