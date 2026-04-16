'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { isCalendarViewPath } from '@/features/calendar';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { InlineBanner } from '@/lib/components/ui/inline-banner';
import { useHideOnScroll } from '@/lib/hooks/useHideOnScroll';
import { useInlineBanner } from '@/lib/hooks/useInlineBanner';
import { useShellStore } from '@/lib/stores/useShellStore';

import { BottomTabBar } from './BottomTabBar';

import { MainContentWrapper } from './main-content-wrapper';
import { MobileCreateSheet } from './MobileCreateSheet';
import { MobileHistoryStrip } from './MobileHistoryStrip';

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
  const banner = useInlineBanner();

  const pathname = usePathname();
  const { hidden, reset } = useHideOnScroll();

  // ページ遷移時にボトムバーを再表示
  useEffect(() => {
    reset();
  }, [pathname, reset]);

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
            {title && <h1 className="truncate text-lg leading-8 font-medium">{title}</h1>}
          </AppHeader>
        )}

        {/* インラインバナー（独自ヘッダーを持つページは自前で配置） */}
        {!hasOwnHeader && <InlineBanner {...banner} />}

        {/* Main Content（BottomTabBar + HistoryStrip分の余白を確保） */}
        <MainContentWrapper className="pb-24">{children}</MainContentWrapper>
      </div>

      {/* 作成ボトムシート（RecentBlocks） */}
      <MobileCreateSheet />

      {/* 履歴ストリップ（BottomTabBarの直上） */}
      <MobileHistoryStrip hidden={hidden} />

      {/* ボトムタブナビゲーション */}
      <BottomTabBar hidden={hidden} />
    </>
  );
}
