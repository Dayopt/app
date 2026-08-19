'use client';

import { BarChart3, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatCalendarDateParam, useCalendarNavigation } from '@/features/calendar';
import { cn } from '@dayopt/components';
import { Link, usePathname } from '@dayopt/i18n/navigation';

import { getWorkspaceTabFromPath } from './workspace-tabs';

/**
 * Sidebar 上部のタブ（カレンダー / レポート）。
 *
 * タブ href は現在の日付（と calendar タブなら view）を引き継ぐ。これが
 * タブ往復で日付・view が保たれる仕組みの本体（overview.md §6-9 #1）。
 * `useSearchParams()` は使わない（§5-3 と同じ理由）。
 */
export function WorkspaceTabs() {
  const t = useTranslations();
  const pathname = usePathname();
  const navigation = useCalendarNavigation();

  const currentTab = getWorkspaceTabFromPath(pathname);
  const date = navigation ? formatCalendarDateParam(navigation.currentDate) : undefined;
  const view = navigation?.viewType ?? 'week';

  const calendarHref = date ? `/calendar?view=${view}&date=${date}` : `/calendar?view=${view}`;
  const reportHref = date ? `/report?date=${date}` : '/report';

  return (
    <div className="flex items-center gap-1 px-2 py-2" role="tablist">
      <TabButton
        href={calendarHref}
        label={t('sidebar.pageNav.calendar')}
        icon={<CalendarDays className="size-4" />}
        active={currentTab === 'calendar'}
      />
      <TabButton
        href={reportHref}
        label={t('sidebar.pageNav.report')}
        icon={<BarChart3 className="size-4" />}
        active={currentTab === 'report'}
      />
    </div>
  );
}

function TabButton({
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
        'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-normal transition-colors duration-150',
        active
          ? 'bg-state-selected text-foreground'
          : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
