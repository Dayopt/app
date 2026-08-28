'use client';

/**
 * Calendar タブの Sidebar 本体（Composition Layer、スクロール領域）
 *
 * view switcher + tag filter。MiniCalendar は Sidebar の pinned 領域
 * （プロフィール直上）へ移動した（#2217）。中身は書き換えない（旧 docs/projects/
 * _archive/workspace-shell-restructure/overview.md §5-2、docs/projects 全廃に伴い
 * #2473 で削除。git 履歴参照）。
 */

import { ActivityFilterList, ViewSwitcherList } from '@/features/calendar';

export function CalendarSidebar() {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden px-2">
      <ViewSwitcherList />
      <ActivityFilterList />
    </div>
  );
}
