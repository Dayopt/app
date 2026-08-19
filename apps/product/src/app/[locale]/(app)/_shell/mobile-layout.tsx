'use client';

import { AppHeader } from '@/components/shell/AppHeader';
import { ActivityChipRow, isCalendarViewPath } from '@/features/calendar';
import { useShellStore } from '@/lib/stores/useShellStore';
import { InlineBanner } from '@dayopt/components';
import { usePathname } from '@dayopt/i18n/navigation';

import { BottomTabBar } from './BottomTabBar';
import { ConnectedMobileAccountButton } from './MobileAccountButton';
import { useAppInlineBanner } from './useAppInlineBanner';

import { MainContentWrapper } from './main-content-wrapper';

interface MobileLayoutProps {
  children: React.ReactNode;
}

/**
 * モバイル用レイアウト
 *
 * **構成**:
 * - AppHeader（ナビゲーション）
 * - MainContent
 * - 固定バー群（画面下端、縦積み。overview.md §5-7-b）:
 *   - ActivityChipRow（Calendar タブのみ）
 *   - BottomTabBar（常時、ワークスペースタブ切替）
 *
 * 固定バー群は 1 つのコンテナにまとめ、`pb-safe` はコンテナの最下段
 * （BottomTabBar 側）にだけ付ける。本文の余白は固定トークン（動的測定
 * なし）で、タブごとに 1 段 / 2 段を出し分ける。
 */
export function MobileLayout({ children }: MobileLayoutProps) {
  const title = useShellStore.use.pageTitle();
  const banner = useAppInlineBanner();

  const pathname = usePathname();

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader =
    isCalendarViewPath(pathname) || pathname === '/settings' || pathname.startsWith('/settings/');

  const isCalendarView = isCalendarViewPath(pathname);

  return (
    <>
      {/* AppHeader + Main Content */}
      <div className="flex h-full flex-1 flex-col">
        {/* AppHeader（Calendar は独自ヘッダーを持つため非表示） */}
        {!hasOwnHeader && (
          <AppHeader rightSlot={<ConnectedMobileAccountButton />}>
            {title && <h1 className="truncate text-lg leading-8 font-medium">{title}</h1>}
          </AppHeader>
        )}

        {/* インラインバナー（自前ヘッダーを持つ画面を含む全ページ共通） */}
        <InlineBanner {...banner} />

        {/* Main Content: calendar タブは ActivityChipRow + BottomTabBar の2段分、
            それ以外は BottomTabBar 1段分の余白を確保する（固定トークン、動的測定なし） */}
        <MainContentWrapper className={isCalendarView ? 'pb-32' : 'pb-16'}>
          {children}
        </MainContentWrapper>
      </div>

      {/* 固定バー群: ActivityChipRow（calendarタブのみ）→ BottomTabBar の順で縦積み。
          pb-safe はこのコンテナの最下段にだけ付ける */}
      <div className="bg-surface-container border-border-subtle z-bottom-tab pb-safe fixed inset-x-0 bottom-0 flex flex-col border-t">
        {isCalendarView && <ActivityChipRow />}
        <BottomTabBar />
      </div>
    </>
  );
}
