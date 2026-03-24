'use client';

import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { HoverTooltip } from '@/components/ui/tooltip';
import { SyncStatusIndicator } from '@/shell/components/SyncStatusIndicator';
import { useLayoutStore } from '@/stores/useLayoutStore';

import { MobileMenuButton } from './MobileMenuButton';

interface AppHeaderProps {
  /** 左コンテンツ: 日付表示、ページタイトル等 */
  children: React.ReactNode;
  /** デスクトップ: 左コンテンツ後のコントロール群（DateNavigator + ViewSwitcher等） */
  controls?: React.ReactNode;
  /** デスクトップ右側スロット */
  rightSlot?: React.ReactNode;
  /** モバイル右側コンテンツ: 検索/Todayボタン等 */
  mobileRightSlot?: React.ReactNode;
}

/**
 * アプリ共通ヘッダーシェル
 *
 * Calendar / Stats / 通常ページで共有する構造的クロム。
 * ページ固有の日付表示やコントロールは slots で注入する。
 *
 * **デザイン仕様:**
 * - 全体の高さ: 48px固定（h-12）
 * - 上下パディング: 8px（py-2）
 * - コンテナ: 32px（h-8）
 * - 8pxグリッドシステム準拠
 */
export function AppHeader({ children, controls, rightSlot, mobileRightSlot }: AppHeaderProps) {
  const t = useTranslations();
  const isSidebarOpen = useLayoutStore.use.sidebarOpen();
  const openSidebar = useLayoutStore.use.openSidebar();

  return (
    <header className="bg-background relative h-12 px-4 py-2">
      <div className="flex h-8 items-center justify-between">
        {/* 左側: メニュー + コンテンツ + コントロール群 */}
        <div className="flex items-center gap-2">
          {/* サイドバー開くボタン（PCのみ、サイドバーが閉じている時のみ表示） */}
          {!isSidebarOpen && (
            <HoverTooltip content={t('navigation.sidebar.openSidebar')} side="bottom">
              <Button
                variant="ghost"
                icon
                className="hidden size-8 md:flex"
                onClick={openSidebar}
                aria-label={t('navigation.sidebar.openSidebar')}
              >
                <PanelLeft className="size-4" />
              </Button>
            </HoverTooltip>
          )}

          {/* モバイルメニューボタン */}
          <MobileMenuButton className="md:hidden" />

          {/* ページ固有の左コンテンツ（日付表示、タイトル等） */}
          {children}

          {/* コントロール群 - PCのみ */}
          {controls && <div className="ml-2 hidden items-center md:flex">{controls}</div>}
        </div>

        {/* 右側 */}
        <div className="flex items-center gap-2">
          {/* 同期状態インジケーター（オフライン/同期待ち時のみ表示） */}
          <SyncStatusIndicator />

          {/* モバイル右側コンテンツ */}
          {mobileRightSlot && (
            <div className="flex items-center gap-2 md:hidden">{mobileRightSlot}</div>
          )}

          {/* デスクトップ右側スロット */}
          {rightSlot && <div className="hidden items-center gap-2 md:flex">{rightSlot}</div>}
        </div>
      </div>
    </header>
  );
}
