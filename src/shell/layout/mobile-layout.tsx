'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { isCalendarViewPath } from '@/features/calendar';
import { AppHeader } from '@/shell/components/AppHeader';
import { useShellStore } from '@/shell/stores/useShellStore';
import { BottomTabBar } from './BottomTabBar';

import { MainContentWrapper } from './main-content-wrapper';
import { MobileCreateSheet } from './MobileCreateSheet';

interface MobileLayoutProps {
  children: React.ReactNode;
  locale: 'ja' | 'en';
}

/**
 * モバイル用レイアウト
 *
 * **構成**:
 * - AppHeader（ナビゲーション）
 * - MainContent（pb-16でBottomTabBar分の余白確保）
 * - BottomTabBar（固定ボトムタブ）
 */
export function MobileLayout({ children, locale }: MobileLayoutProps) {
  const title = useShellStore.use.pageTitle();

  const pathname = usePathname();

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader = useMemo(() => {
    const pathWithoutLocale = pathname?.replace(new RegExp(`^/${locale}`), '') ?? '';
    return (
      isCalendarViewPath(pathWithoutLocale) ||
      pathWithoutLocale.startsWith('/stats') ||
      pathWithoutLocale.startsWith('/notifications') ||
      pathWithoutLocale === '/settings' ||
      pathWithoutLocale.startsWith('/settings/')
    );
  }, [pathname, locale]);

  return (
    <>
      {/* AppHeader + Main Content */}
      <div className="flex h-full flex-1 flex-col">
        {/* AppHeader（Calendar/Statsは独自ヘッダーを持つため非表示） */}
        {!hasOwnHeader && (
          <AppHeader>
            {title && <h1 className="truncate text-lg leading-8 font-bold">{title}</h1>}
          </AppHeader>
        )}

        {/* Main Content（BottomTabBar分の余白をpb-14で確保） */}
        <MainContentWrapper className="pb-14">{children}</MainContentWrapper>
      </div>

      {/* 作成ボトムシート（Palette + RecentBlocks） */}
      <MobileCreateSheet />

      {/* ボトムタブナビゲーション */}
      <BottomTabBar />
    </>
  );
}
