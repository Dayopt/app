'use client';

import { BarChart3, Bell, CalendarDays, UserCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { useAuthStore } from '@/features/auth';
import { useCalendarNavigation } from '@/features/calendar';
import { useUnreadCount } from '@/features/notifications';
import { useStatsFilterStore } from '@/features/stats';
import { Avatar, AvatarFallback, AvatarImage } from '@/lib/components/ui/avatar';
import { useClientRouterStore } from '@/lib/stores/useClientRouterStore';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { cn } from '@/lib/utils';

import { buildCalendarPath, buildStatsPath, getLocaleFromPathname } from './navigation-paths';

type TabId = 'calendar' | 'stats' | 'notifications' | 'account';

function getActiveTabFromPath(pathname: string): TabId {
  const segments = pathname.split('/');
  const pathWithoutLocale =
    segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
      ? '/' + segments.slice(2).join('/')
      : pathname;

  if (pathWithoutLocale.startsWith('/settings')) return 'account';
  if (pathWithoutLocale.startsWith('/notifications')) return 'notifications';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  return 'calendar';
}

interface BottomTabBarProps {
  hidden?: boolean;
}

/** モバイル用ボトムタブナビゲーション（Calendar / Stats / Notifications / Account） */
export function BottomTabBar({ hidden = false }: BottomTabBarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const calendarNav = useCalendarNavigation();
  const switchToPage = useClientRouterStore((s) => s.switchToPage);
  const clientPage = useClientRouterStore((s) => s.clientPage);
  const resetToServer = useClientRouterStore((s) => s.resetToServer);
  const { data: unreadCount = 0 } = useUnreadCount();
  const user = useAuthStore((s) => s.user);
  const avatarUrl = getAvatarUrl(user);
  const displayName = getDisplayName(user, 'User');
  const statsGranularity = useStatsFilterStore((s) => s.granularity);
  const statsDate = useStatsFilterStore((s) => s.currentDate);

  const locale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);

  // clientPage（Zustand）を優先、null時は pathname から判定
  const activeTab: TabId = useMemo(() => {
    if (clientPage) return clientPage;
    return getActiveTabFromPath(pathname ?? '/');
  }, [clientPage, pathname]);

  const handleCalendarClick = useCallback(() => {
    if (activeTab === 'calendar') return;

    window.history.pushState(
      null,
      '',
      buildCalendarPath({
        locale,
        viewType: calendarNav?.viewType ?? 'day',
        currentDate: calendarNav?.currentDate,
      }),
    );
    switchToPage('calendar');
  }, [activeTab, calendarNav, locale, switchToPage]);

  const handleStatsClick = useCallback(() => {
    if (activeTab === 'stats') return;

    window.history.pushState(
      null,
      '',
      buildStatsPath(locale, 'review', { granularity: statsGranularity, date: statsDate }),
    );
    switchToPage('stats');
  }, [activeTab, locale, statsGranularity, statsDate, switchToPage]);

  const handleNotificationsClick = useCallback(() => {
    resetToServer();
    router.push(`/${locale}/notifications`);
  }, [router, locale, resetToServer]);

  const handleAccountClick = useCallback(() => {
    resetToServer();
    router.push(`/${locale}/settings`);
  }, [router, locale, resetToServer]);

  const tabs: Array<{
    id: TabId;
    label: string;
    icon: typeof CalendarDays;
    onClick: () => void;
    badge?: number;
  }> = useMemo(
    () => [
      {
        id: 'calendar',
        label: t('navigation.bottomTab.calendar'),
        icon: CalendarDays,
        onClick: handleCalendarClick,
      },
      {
        id: 'stats',
        label: t('navigation.bottomTab.stats'),
        icon: BarChart3,
        onClick: handleStatsClick,
      },
      {
        id: 'notifications',
        label: t('navigation.bottomTab.notifications'),
        icon: Bell,
        onClick: handleNotificationsClick,
        badge: unreadCount,
      },
      {
        id: 'account',
        label: t('navigation.bottomTab.account'),
        icon: UserCircle,
        onClick: handleAccountClick,
      },
    ],
    [
      t,
      handleCalendarClick,
      handleStatsClick,
      handleNotificationsClick,
      handleAccountClick,
      unreadCount,
    ],
  );

  return (
    <nav
      className="bg-surface-container z-bottom-tab pb-safe shadow-card fixed inset-x-0 bottom-0 transition-transform duration-300"
      style={{
        transform: hidden
          ? 'translateY(calc(100% + 3.5rem + env(safe-area-inset-bottom, 0px)))'
          : 'translateY(0)',
      }}
      aria-label={t('common.aria.pageNavigation')}
    >
      <div className="flex h-14 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              aria-current={isActive ? 'page' : undefined}
              onClick={tab.onClick}
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
                {/* 未読バッジ */}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-medium">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span className={cn('text-xs', isActive && 'font-medium')}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
