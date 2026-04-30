'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { isCalendarViewPath, TagChipRow } from '@/features/calendar';
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
 * - BottomTabBar（固定ボトムタブ、常時表示）
 */
export function MobileLayout({ children, locale: _locale }: MobileLayoutProps) {
  const t = useTranslations('common.inlineBanner');
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
      pathWithoutLocale.startsWith('/stats') ||
      pathWithoutLocale === '/settings' ||
      pathWithoutLocale.startsWith('/settings/'),
    [pathWithoutLocale],
  );

  const isCalendarView = useMemo(() => isCalendarViewPath(pathWithoutLocale), [pathWithoutLocale]);

  const isStatsView = useMemo(() => pathWithoutLocale.startsWith('/stats'), [pathWithoutLocale]);

  // calendar / stats 系はモバイルでは編集機能が制限される (P0-6 Option B)
  // tap=Inspector / longpress=ドラッグ は calendar で機能するが、タグ並び替え等の
  // 詳細操作は PC 限定のため、情報として明示する
  const isDesktopOnlyEditPage = useMemo(
    () => isCalendarView || isStatsView,
    [isCalendarView, isStatsView],
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

        {/* Main Content（calendar / stats view では TagChipRow + BottomTabBar 分の余白を確保） */}
        <MainContentWrapper className={isCalendarView || isStatsView ? 'pb-32' : 'pb-16'}>
          {children}
        </MainContentWrapper>
      </div>

      {/* calendar: タグタップで予定作成 popover / stats: タップでタグ統計詳細へ遷移 */}
      {isCalendarView && <TagChipRow />}
      {isStatsView && <TagChipRow mode="stats-link" />}

      {/* ボトムタブナビゲーション */}
      <BottomTabBar />
    </>
  );
}
