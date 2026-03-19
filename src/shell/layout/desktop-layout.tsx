'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { AppHeader } from '@/components/AppHeader';
import { isCalendarViewPath } from '@/features/calendar';
import { NotificationDropdown } from '@/features/notifications';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/shell/components/Sidebar';
import { usePageTitleStore } from '@/shell/stores/usePageTitleStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

import { MainContentWrapper } from './main-content-wrapper';
import { SidebarContent } from './SidebarContent';

interface DesktopLayoutProps {
  children: React.ReactNode;
  locale: 'ja' | 'en';
}

/**
 * デスクトップ用レイアウト
 *
 * 2カラムレイアウト:
 * - Sidebar（256px、開閉可能）← 全ページ共通 Sidebar
 * - PageHeader + MainContent + Inspector
 */
export function DesktopLayout({ children, locale }: DesktopLayoutProps) {
  const pathname = usePathname();
  const isSidebarOpen = useLayoutStore.use.sidebarOpen();
  const title = usePageTitleStore((state) => state.title);

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader = useMemo(() => {
    const pathWithoutLocale = pathname?.replace(new RegExp(`^/${locale}`), '') ?? '';
    return isCalendarViewPath(pathWithoutLocale) || pathWithoutLocale.startsWith('/stats');
  }, [pathname, locale]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar（固定幅256px、開閉可能） */}
        <div
          className={cn(
            'h-full shrink-0 overflow-hidden transition-all duration-200',
            isSidebarOpen ? 'w-64' : 'w-0',
          )}
        >
          <div className="h-full w-64">
            <Sidebar footerActions={<NotificationDropdown size="sm" />}>
              <SidebarContent />
            </Sidebar>
          </div>
        </div>

        {/* PageHeader + Main Content + Inspector */}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* AppHeader（Calendar/Statsは独自ヘッダーを持つため非表示） */}
          {!hasOwnHeader && (
            <AppHeader>
              {title && <h1 className="truncate text-lg leading-8 font-bold">{title}</h1>}
            </AppHeader>
          )}

          {/* Main Content + Inspector（自動的に残りのスペースを使用） */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="relative flex h-full min-h-0 flex-col">
              <MainContentWrapper>{children}</MainContentWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
