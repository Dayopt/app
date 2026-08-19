'use client';

/**
 * モバイルのワークスペースタブ（カレンダー / レポート）。
 *
 * `66a3ea6db` で削除された旧 BottomTabBar（3〜4 タブ、prefix マッチ判定）は
 * 復元しない。タブ 2 個・パス完全一致 2 値の新実装で、判定は
 * `getWorkspaceTabFromPath`（desktop の WorkspaceTabs と共用）。
 * href は現在の日付（と calendar タブなら view）を引き継ぐ（desktop の
 * WorkspaceTabs と同じ理由。overview.md §6-9 #1・§5-7-c）。
 */

import { BarChart3, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatCalendarDateParam, useCalendarNavigation } from '@/features/calendar';
import { cn } from '@dayopt/components';
import { Link, usePathname } from '@dayopt/i18n/navigation';

import { getWorkspaceTabFromPath } from './workspace-tabs';

export function BottomTabBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const navigation = useCalendarNavigation();
  const tab = getWorkspaceTabFromPath(pathname);

  const date = navigation ? formatCalendarDateParam(navigation.currentDate) : undefined;
  const view = navigation?.viewType ?? 'week';
  const calendarHref = date ? `/calendar?view=${view}&date=${date}` : `/calendar?view=${view}`;
  const reportHref = date ? `/report?date=${date}` : '/report';

  return (
    <nav
      className="bg-surface-container flex min-h-14 items-center justify-around"
      role="tablist"
      aria-label={t('sidebar.pageNav.calendar')}
    >
      <TabLink
        href={calendarHref}
        label={t('sidebar.pageNav.calendar')}
        icon={<CalendarDays className="size-5" />}
        active={tab === 'calendar'}
      />
      <TabLink
        href={reportHref}
        label={t('sidebar.pageNav.report')}
        icon={<BarChart3 className="size-5" />}
        active={tab === 'report'}
      />
    </nav>
  );
}

function TabLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        'flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </Link>
  );
}
