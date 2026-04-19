'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { isCalendarViewPath } from '@/features/calendar';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { InlineBanner } from '@/lib/components/ui/inline-banner';
import { useShellStore } from '@/lib/stores/useShellStore';

import { BottomTabBar } from './BottomTabBar';
import { useAppInlineBanner } from './useAppInlineBanner';

import { MainContentWrapper } from './main-content-wrapper';

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
  const banner = useAppInlineBanner();

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
            {title && <h1 className="truncate text-lg leading-8 font-medium">{title}</h1>}
          </AppHeader>
        )}

        {/* インラインバナー（独自ヘッダーを持つページは自前で配置） */}
        {!hasOwnHeader && <InlineBanner {...banner} />}

        {/* Main Content（BottomTabBar分の余白を確保） */}
        <MainContentWrapper className="pb-16">{children}</MainContentWrapper>
      </div>

      {/* ボトムタブナビゲーション */}
      <BottomTabBar />
    </>
  );
}
