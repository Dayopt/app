'use client';

import { BarChart3, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatCalendarDateParam, useCalendarNavigation } from '@/features/calendar';
import { cn, HoverTooltip } from '@dayopt/components';
import { Link, usePathname } from '@dayopt/i18n/navigation';

import { getWorkspaceTabFromPath } from './workspace-tabs';

/**
 * Sidebar ヘッダー行（カレンダー / レポート切替）の状態を集約する hook。
 *
 * タブ href は現在の日付（と calendar タブなら view）を引き継ぐ。これが
 * タブ往復で日付・view が保たれる仕組みの本体（overview.md §6-9 #1）。
 * `useSearchParams()` は使わない（§5-3 と同じ理由）。
 */
function useWorkspaceTabsState() {
  const t = useTranslations();
  const pathname = usePathname();
  const navigation = useCalendarNavigation();

  const currentTab = getWorkspaceTabFromPath(pathname);
  const date = navigation ? formatCalendarDateParam(navigation.currentDate) : undefined;
  const view = navigation?.viewType ?? 'week';

  const calendarHref = date ? `/calendar?view=${view}&date=${date}` : `/calendar?view=${view}`;
  const reportHref = date ? `/report?date=${date}` : '/report';
  const calendarLabel = t('sidebar.pageNav.calendar');
  const reportLabel = t('sidebar.pageNav.report');

  return { currentTab, calendarHref, reportHref, calendarLabel, reportLabel };
}

/**
 * Sidebar ヘッダーの左側に置く、現在のワークスペース名（カレンダー / レポート）。
 * 旧来の固定表記「Dayopt」の代わりに、現在地を示す動的タイトルとして使う。
 */
export function WorkspaceTitle() {
  const { currentTab, calendarLabel, reportLabel } = useWorkspaceTabsState();

  return (
    <span className="text-foreground truncate text-base font-medium tracking-tight">
      {currentTab === 'report' ? reportLabel : calendarLabel}
    </span>
  );
}

/**
 * Sidebar ヘッダーの右側に置く、カレンダー / レポート切替アイコン。
 *
 * Sidebar.tsx の検索・閉じるボタンと同じ「size-8 + 44pxタップターゲット」の
 * 技法（`packages/components/src/actions/button.tsx` の `_square-sm` variant）に揃える。
 */
export function WorkspaceTabs() {
  const { currentTab, calendarHref, reportHref, calendarLabel, reportLabel } =
    useWorkspaceTabsState();

  return (
    <div className="bg-muted flex items-center rounded-lg" role="tablist">
      <IconTabButton
        href={calendarHref}
        label={calendarLabel}
        icon={<CalendarDays className="size-4" />}
        active={currentTab === 'calendar'}
      />
      <IconTabButton
        href={reportHref}
        label={reportLabel}
        icon={<BarChart3 className="size-4" />}
        active={currentTab === 'report'}
      />
    </div>
  );
}

function IconTabButton({
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
    <HoverTooltip content={label} side="bottom">
      <Link
        href={href}
        role="tab"
        aria-selected={active}
        aria-label={label}
        className={cn(
          'relative flex size-8 items-center justify-center rounded-lg transition-colors duration-150',
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 44pxタップターゲット確保。Buttonの_square-sm variantと同じ技法（packages/components/src/actions/button.tsx）
          'after:absolute after:inset-0 after:m-auto after:size-11 after:content-[""]',
          active
            ? 'bg-state-selected text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {icon}
      </Link>
    </HoverTooltip>
  );
}
