'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/shell/AppHeader';
import {
  ActivityChipRow,
  formatCalendarDateParam,
  isCalendarViewPath,
  resolveWorkspaceTab,
  useCalendarNavigation,
} from '@/features/calendar';
import { useShellStore } from '@/lib/stores/useShellStore';
import { Button, InlineBanner } from '@dayopt/components';
import { Link, usePathname } from '@dayopt/i18n/navigation';

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
 * - AppHeader（ナビゲーション。report 画面ではアカウントボタンの左横に
 *   カレンダーへ戻るトグルアイコンを置く。#2300 でフッターの
 *   BottomTabBar を廃止し、ワークスペース切替はヘッダーのトグルへ移行した）
 * - MainContent
 * - 固定バー群（画面下端。overview.md §5-7-b）: ActivityChipRow（Calendar
 *   タブのみ）。`pb-safe` はこのバー自身に付ける
 *
 * 本文の余白は固定トークン（動的測定なし）で、calendar タブだけ
 * ActivityChipRow 1 段分を確保する。
 */
export function MobileLayout({ children }: MobileLayoutProps) {
  const title = useShellStore.use.pageTitle();
  const banner = useAppInlineBanner();
  const t = useTranslations();
  const navigation = useCalendarNavigation();

  const pathname = usePathname();

  // ページ判定: 独自ヘッダーを持つページかどうか（AppHeader表示制御用）
  const hasOwnHeader =
    isCalendarViewPath(pathname) || pathname === '/settings' || pathname.startsWith('/settings/');

  const isCalendarView = isCalendarViewPath(pathname);
  const isReportView = resolveWorkspaceTab(pathname) === 'report';

  const view = navigation?.viewType ?? 'day';
  const calendarHref = navigation
    ? `/calendar?view=${view}&date=${formatCalendarDateParam(navigation.currentDate)}`
    : `/calendar?view=${view}`;

  return (
    <>
      {/* AppHeader + Main Content */}
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {/* AppHeader（Calendar は独自ヘッダーを持つため非表示）
            sticky: スクロール祖先の先頭に固定する（calendar 側の実装と揃える） */}
        {!hasOwnHeader && (
          <div className="bg-background sticky top-0 z-20">
            <AppHeader
              rightSlot={
                <div className="flex h-8 items-center gap-1">
                  {/* フッターの BottomTabBar 廃止に伴うトグル（#2300）。
                      現在地ではなく遷移先（カレンダー）を示すアイコン。
                      report 画面限定（他の非独自ヘッダー画面には出さない） */}
                  {isReportView && (
                    <Button
                      variant="ghost"
                      icon
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      asChild
                    >
                      <Link href={calendarHref} aria-label={t('calendar.actions.openCalendar')}>
                        <CalendarDays className="size-5" />
                      </Link>
                    </Button>
                  )}
                  <ConnectedMobileAccountButton />
                </div>
              }
            >
              {title && <h1 className="truncate text-lg leading-8 font-medium">{title}</h1>}
            </AppHeader>
          </div>
        )}

        {/* インラインバナー（自前ヘッダーを持つ画面を含む全ページ共通） */}
        <InlineBanner {...banner} />

        {/* Main Content: calendar タブは ActivityChipRow 1段分の余白を確保する
            （固定トークン、動的測定なし）。それ以外は固定バーが無いため余白不要 */}
        <MainContentWrapper {...(isCalendarView ? { className: 'pb-16' } : {})}>
          {children}
        </MainContentWrapper>
      </div>

      {/* calendar タブのみ: ActivityChipRow を画面下端に固定。
          pb-safe はこのバー自身に付ける */}
      {isCalendarView && (
        <div className="bg-surface-container border-border-subtle z-bottom-tab pb-safe fixed inset-x-0 bottom-0 flex flex-col border-t">
          <ActivityChipRow />
        </div>
      )}
    </>
  );
}
