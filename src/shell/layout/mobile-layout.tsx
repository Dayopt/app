'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { isCalendarViewPath } from '@/features/calendar';
import { AppHeader } from '@/shell/components/AppHeader';
import { Sidebar } from '@/shell/components/Sidebar';
import { usePageTitleStore } from '@/shell/stores/usePageTitleStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

import { MainContentWrapper } from './main-content-wrapper';
import { SidebarContent } from './SidebarContent';

interface MobileLayoutProps {
  children: React.ReactNode;
  locale: 'ja' | 'en';
}

/**
 * モバイル用レイアウト
 *
 * **構成**:
 * - PageHeader（ナビゲーション + 検索）
 * - Sheet（左オーバーレイ）でサイドバーを表示
 * - MainContent
 *
 * **ドロワー仕様**:
 * - モーダル動作（オーバーレイシェードで親要素を覆う）
 * - ハンバーガーメニューで開閉
 * - エレベーション付き
 */
export function MobileLayout({ children, locale }: MobileLayoutProps) {
  const tAria = useTranslations('common.aria');
  // auto-generated selectors: 必要な値だけ監視（他の状態変更時の再レンダリングを防止）
  const isOpen = useLayoutStore.use.sidebarOpen();
  const toggle = useLayoutStore.use.toggleSidebar();
  const close = useLayoutStore.use.closeSidebar();
  const title = usePageTitleStore.use.title();

  // モバイルでの初期表示時にサイドバーを閉じる
  // デスクトップとストアを共有しているため、初期状態がtrueになる問題を解決
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!isInitializedRef.current) {
      close();
      isInitializedRef.current = true;
    }
  }, [close]);

  // 初期化前は常にfalse、初期化後はストアの値を使用
  // eslint-disable-next-line react-hooks/refs -- useEffect初期化前のサイドバーフラッシュ防止ガード
  const sheetOpen = isInitializedRef.current ? isOpen : false;

  const pathname = usePathname();

  // ページ判定: 独自ヘッダーを持つページかどうか（PageHeader表示制御用）
  const hasOwnHeader = useMemo(() => {
    const pathWithoutLocale = pathname?.replace(new RegExp(`^/${locale}`), '') ?? '';
    return isCalendarViewPath(pathWithoutLocale) || pathWithoutLocale.startsWith('/stats');
  }, [pathname, locale]);

  return (
    <>
      {/* モバイル: Sheet（左オーバーレイ）でSidebarを表示 */}
      <Sheet open={sheetOpen} onOpenChange={toggle}>
        <SheetContent
          side="left"
          className="p-0"
          showCloseButton={false}
          aria-label={tAria('navigationMenu')}
        >
          <Sidebar>
            <SidebarContent />
          </Sidebar>
        </SheetContent>
      </Sheet>

      {/* PageHeader + Main Content */}
      <div className="flex h-full flex-1 flex-col">
        {/* AppHeader（Calendar/Statsは独自ヘッダーを持つため非表示） */}
        {!hasOwnHeader && (
          <AppHeader>
            {title && <h1 className="truncate text-lg leading-8 font-bold">{title}</h1>}
          </AppHeader>
        )}

        {/* Main Content */}
        <MainContentWrapper>{children}</MainContentWrapper>
      </div>
    </>
  );
}
