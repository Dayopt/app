'use client';

import { BarChart3, CalendarDays, UserCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { useAuthStore } from '@/features/auth';
import { useCalendarNavigation } from '@/features/calendar';
import { useStatsFilterStore } from '@/features/stats';
import { NavBadge, type NavBadgeVariant } from '@/lib/components/shell/sidebar/NavBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/lib/components/ui/avatar';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { cn } from '@/lib/utils';

import { buildCalendarPath, buildStatsPath, getLocaleFromPathname } from './navigation-paths';

type TabId = 'calendar' | 'stats' | 'account';

function getActiveTabFromPath(pathname: string): TabId {
  const segments = pathname.split('/');
  const pathWithoutLocale =
    segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
      ? '/' + segments.slice(2).join('/')
      : pathname;

  if (pathWithoutLocale.startsWith('/settings')) return 'account';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  return 'calendar';
}

/** モバイル用ボトムタブナビゲーション（Calendar / Stats / Account） */
export function BottomTabBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const calendarNav = useCalendarNavigation();
  const user = useAuthStore((s) => s.user);
  const avatarUrl = getAvatarUrl(user);
  const displayName = getDisplayName(user, 'User');
  const statsGranularity = useStatsFilterStore((s) => s.granularity);
  const statsDate = useStatsFilterStore((s) => s.currentDate);

  const locale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);
  const activeTab: TabId = getActiveTabFromPath(pathname ?? '/');

  const calendarHref = useMemo(
    () =>
      buildCalendarPath({
        locale,
        viewType: calendarNav?.viewType ?? 'day',
        currentDate: calendarNav?.currentDate,
      }),
    [locale, calendarNav?.viewType, calendarNav?.currentDate],
  );

  const statsHref = useMemo(
    () =>
      buildStatsPath(locale, 'review', {
        granularity: statsGranularity,
        date: statsDate,
      }),
    [locale, statsGranularity, statsDate],
  );

  const accountHref = `/${locale}/settings`;

  const tabs: Array<{
    id: TabId;
    label: string;
    icon: typeof CalendarDays;
    href: string;
    badge?: NavBadgeVariant | null;
  }> = useMemo(
    () => [
      {
        id: 'calendar',
        label: t('navigation.bottomTab.calendar'),
        icon: CalendarDays,
        href: calendarHref,
      },
      {
        id: 'stats',
        label: t('navigation.bottomTab.stats'),
        icon: BarChart3,
        href: statsHref,
      },
      {
        id: 'account',
        label: t('navigation.bottomTab.account'),
        icon: UserCircle,
        href: accountHref,
      },
    ],
    [t, calendarHref, statsHref, accountHref],
  );

  return (
    <nav
      className="bg-surface-container z-bottom-tab pb-safe shadow-card fixed inset-x-0 bottom-0"
      aria-label={t('common.aria.pageNavigation')}
    >
      <div className="flex h-14 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {/* アクティブ時はピル型背景でアイコンを囲む（M3スタイル） */}
              <span
                className={cn(
                  'relative flex items-center justify-center rounded-full px-4 py-1 transition-colors',
                  isActive && 'bg-primary-state-selected',
                )}
              >
                {/* Accountタブはユーザーアバターを表示 */}
                {tab.id === 'account' ? (
                  <Avatar className="size-6">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Icon className="size-5" strokeWidth={isActive ? 2.5 : 1.5} />
                )}
                {tab.badge && <NavBadge variant={tab.badge} />}
              </span>
              <span className={cn('text-xs', isActive && 'font-medium')}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
