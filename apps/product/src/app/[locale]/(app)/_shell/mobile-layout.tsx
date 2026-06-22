'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { isCalendarViewPath, TagChipRow } from '@/features/calendar';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { InlineBanner } from '@/lib/components/ui/inline-banner';
import { useShellStore } from '@/lib/stores/useShellStore';

import { ConnectedMobileAccountButton } from './MobileAccountButton';
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
 * - MainContent
 * - TagChipRow（Calendar のみ、固定フッター）
 */
export function MobileLayout({ children, locale: _locale }: MobileLayoutProps) {
  const title = useShellStore.use.pageTitle();
  const banner = useAppInlineBanner();

  const pathname = usePathname();

  // localePrefix: 'as-needed' により default locale の URL は prefix なし
  // (例: /calendar/day) の場合もあるため、prop の locale ではなく実際の
  // URL セグメントから /en/ /ja/ のみを剥がす。未知の先頭セグメントは維持する。
  const pathWithoutLocale = useMemo(
    () => (pathname ?? '').replace(/^\/(en|ja)(?=\/|$)/, ''),
    [pathname],
  );

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader = useMemo(
    () =>
      isCalendarViewPath(pathWithoutLocale) ||
      pathWithoutLocale === '/settings' ||
      pathWithoutLocale.startsWith('/settings/'),
    [pathWithoutLocale],
  );

  const isCalendarView = useMemo(() => isCalendarViewPath(pathWithoutLocale), [pathWithoutLocale]);

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

        {/* インラインバナー（独自ヘッダーを持つページは自前で配置） */}
        {!hasOwnHeader && <InlineBanner {...banner} />}

        {/* Main Content（calendar view ではタグフッター分の余白を確保） */}
        {isCalendarView ? (
          <MainContentWrapper className="pb-16">{children}</MainContentWrapper>
        ) : (
          <MainContentWrapper>{children}</MainContentWrapper>
        )}
      </div>

      {/* calendar: タグタップで予定作成 popover */}
      {isCalendarView && <TagChipRow />}
    </>
  );
}
