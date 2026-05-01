'use client';

/**
 * Sidebar Content dispatcher (Composition Layer)
 *
 * pathname を読んで現在の app モードを判定し、対応するモード別 Sidebar
 * (CalendarSidebar / ReviewSidebar) を render する。Sidebar 外殻は
 * desktop-layout.tsx で静止維持し、中身のみ mode 切替で入替える。
 *
 * SidebarUtilities は全モード共通のため dispatch 外で描画。
 */

import { usePathname } from 'next/navigation';

import { CalendarSidebar } from './CalendarSidebar';
import { getModeFromPath } from './navigation-paths';
import { ReviewSidebar } from './ReviewSidebar';
import { SidebarUtilities } from './SidebarUtilities';

export function SidebarContent() {
  const pathname = usePathname();
  const mode = getModeFromPath(pathname);

  return (
    <>
      {renderModeContent(mode)}
      <SidebarUtilities />
    </>
  );
}

function renderModeContent(mode: ReturnType<typeof getModeFromPath>) {
  switch (mode) {
    case 'review':
      return <ReviewSidebar />;
    case 'calendar':
    case 'other':
      // fallback: settings 等のモード外は CalendarSidebar を表示 (現状互換)
      return <CalendarSidebar />;
  }
}
