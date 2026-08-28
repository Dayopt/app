'use client';

/**
 * Sidebar の pinned 領域（スクロールに追従しない、プロフィール直上）の中身。
 *
 * MiniCalendar をサイドバー最上部から最下部へ移動した（#2217）。calendar /
 * report いずれのタブも `?date=` を持つため、両タブで同じ MiniCalendar を表示する
 * （旧 docs/projects/_archive/workspace-shell-restructure/overview.md §5-5「/report も
 * ?date= を持つのでカレンダータブと同じ部品をそのまま使う」、docs/projects 全廃に伴い
 * #2473 で削除。git 履歴参照）。workspace 外の
 * パス（'other'、例: /settings）では何も表示しない。
 */

import { MiniCalendar } from '@/components/ui/inputs/mini-calendar';
import { useCalendarNavigation } from '@/features/calendar';
import { usePathname } from '@dayopt/i18n/navigation';

import { getWorkspaceTabFromPath } from './workspace-tabs';

export function SidebarPinnedContent() {
  const pathname = usePathname();
  const navigation = useCalendarNavigation();
  const tab = getWorkspaceTabFromPath(pathname);

  if (tab === 'other') return null;

  return (
    <MiniCalendar
      selectedDate={navigation?.currentDate}
      onDateSelect={(date) => {
        if (date && navigation) navigation.navigateToDate(date, true);
      }}
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- calc expression
      className="-mx-2 w-[calc(100%+16px)] bg-transparent"
    />
  );
}
