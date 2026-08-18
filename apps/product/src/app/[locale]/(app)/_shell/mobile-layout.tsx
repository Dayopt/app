'use client';

import { AppHeader } from '@/components/shell/AppHeader';
import { ActivityChipRow, isCalendarViewPath } from '@/features/calendar';
import { useShellStore } from '@/lib/stores/useShellStore';
import { InlineBanner } from '@dayopt/components';
import { usePathname } from '@dayopt/i18n/navigation';

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
 * - ActivityChipRow（Calendar のみ、固定フッター）
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

        {/* Main Content（calendar view ではタグフッター分の余白を確保） */}
        {isCalendarView ? (
          <MainContentWrapper className="pb-16">{children}</MainContentWrapper>
        ) : (
          <MainContentWrapper>{children}</MainContentWrapper>
        )}
      </div>

      {/* calendar: タグタップで予定作成 popover */}
      {isCalendarView && <ActivityChipRow />}
    </>
  );
}
