'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { isCalendarViewPath } from '@/features/calendar';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { InlineBanner } from '@/lib/components/ui/inline-banner';
import { useHideOnScroll } from '@/lib/hooks/useHideOnScroll';
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
 * - BottomTabBar（固定ボトムタブ、スクロール連動 auto-hide）
 */
export function MobileLayout({ children, locale }: MobileLayoutProps) {
  const t = useTranslations('common.inlineBanner');
  const title = useShellStore.use.pageTitle();
  const banner = useAppInlineBanner();

  const pathname = usePathname();
  const { hidden, reset } = useHideOnScroll();

  // ページ遷移時にボトムバーを再表示
  useEffect(() => {
    reset();
  }, [pathname, reset]);

  const pathWithoutLocale = useMemo(
    () => pathname?.replace(new RegExp(`^/${locale}`), '') ?? '',
    [pathname, locale],
  );

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader = useMemo(
    () =>
      isCalendarViewPath(pathWithoutLocale) ||
      pathWithoutLocale.startsWith('/stats') ||
      pathWithoutLocale.startsWith('/notifications') ||
      pathWithoutLocale === '/settings' ||
      pathWithoutLocale.startsWith('/settings/'),
    [pathWithoutLocale],
  );

  // calendar / stats 系はモバイルでは編集機能が制限される (P0-6 Option B)
  // tap=Inspector / longpress=ドラッグ は calendar で機能するが、タグ並び替え等の
  // 詳細操作は PC 限定のため、情報として明示する
  const isDesktopOnlyEditPage = useMemo(
    () => isCalendarViewPath(pathWithoutLocale) || pathWithoutLocale.startsWith('/stats'),
    [pathWithoutLocale],
  );

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

        {/* モバイル閲覧専用の告知（calendar / stats） */}
        {isDesktopOnlyEditPage && <InlineBanner visible message={t('mobileReadOnly')} />}

        {/* Main Content（BottomTabBar分の余白を確保） */}
        <MainContentWrapper className="pb-16">{children}</MainContentWrapper>
      </div>

      {/* ボトムタブナビゲーション */}
      <BottomTabBar hidden={hidden} />
    </>
  );
}
