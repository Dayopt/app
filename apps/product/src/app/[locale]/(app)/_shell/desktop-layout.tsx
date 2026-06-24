'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { PanelLeft } from 'lucide-react';

import { AppHeader } from '@/components/shell/AppHeader';
import { Sidebar } from '@/components/shell/sidebar';
import { useAuthStore } from '@/features/auth';
import { isCalendarViewPath } from '@/features/calendar';
import { getAvatarUrl, getDisplayName } from '@/lib/user';
import { cn } from '@/lib/utils';
import { InlineBanner } from '@dayopt/components';

import { useShellStore } from '@/lib/stores/useShellStore';

import { MainContentWrapper } from './main-content-wrapper';
import { SidebarContent } from './SidebarContent';
import { useAppInlineBanner } from './useAppInlineBanner';

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
 *
 */
export function DesktopLayout({ children, locale }: DesktopLayoutProps) {
  const pathname = usePathname();
  const sidebar = useShellStore.use.sidebar();
  const banner = useAppInlineBanner();
  const toggleSidebar = useShellStore.use.toggleSidebar();
  const title = useShellStore.use.pageTitle();
  const authUser = useAuthStore((s) => s.user);
  const sidebarUser = {
    name: getDisplayName(authUser, 'User'),
    email: authUser?.email || '',
    avatar: getAvatarUrl(authUser),
  };

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader = useMemo(() => {
    const pathWithoutLocale = pathname?.replace(new RegExp(`^/${locale}`), '') ?? '';
    return isCalendarViewPath(pathWithoutLocale);
  }, [pathname, locale]);

  // サイドバーが閉じているときに表示するトグルボタン
  const sidebarToggle = !sidebar.open ? (
    <button
      type="button"
      onClick={toggleSidebar}
      className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg transition-colors"
      aria-label="Open sidebar"
    >
      <PanelLeft className="size-4" />
    </button>
  ) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar（固定幅256px、開閉可能） */}
        <div
          className={cn(
            'h-full shrink-0 overflow-hidden transition-all duration-200',
            sidebar.open ? 'w-64' : 'w-0',
          )}
        >
          <div className="h-full w-64">
            <Sidebar user={sidebarUser}>
              <SidebarContent />
            </Sidebar>
          </div>
        </div>

        {/* PageHeader + Main Content + Inspector */}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* AppHeader（Calendar は独自ヘッダーを持つため非表示） */}
          {!hasOwnHeader && (
            <AppHeader leftSlot={sidebarToggle}>
              {title && <h1 className="truncate text-lg leading-8 font-medium">{title}</h1>}
            </AppHeader>
          )}

          {/* インラインバナー（独自ヘッダーを持つページは自前で配置） */}
          {!hasOwnHeader && <InlineBanner {...banner} />}

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
