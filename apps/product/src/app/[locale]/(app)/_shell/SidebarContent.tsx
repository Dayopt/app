'use client';

/**
 * Sidebar Content (Composition Layer)
 *
 * pathname から現在のワークスペースタブを判定し、Sidebar の中身を
 * 出し分ける dispatcher。Sidebar 外殻（Sidebar.tsx）は 1 回だけマウントされ、
 * タブ切替時も再マウントしない（docs/projects/workspace-shell-restructure/
 * overview.md §5-1・§5-2）。
 */

import { usePathname } from '@dayopt/i18n/navigation';

import { CalendarSidebar } from './CalendarSidebar';
import { ReportSidebar } from './ReportSidebar';
import { SidebarUtilities } from './SidebarUtilities';
import { getWorkspaceTabFromPath } from './workspace-tabs';
import { WorkspaceTabs } from './WorkspaceTabs';

export function SidebarContent() {
  const pathname = usePathname();
  const tab = getWorkspaceTabFromPath(pathname);

  return (
    <>
      <WorkspaceTabs />

      {tab === 'report' ? <ReportSidebar /> : <CalendarSidebar />}

      <SidebarUtilities />
    </>
  );
}
