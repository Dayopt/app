'use client';

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { CalendarNavigationProvider } from '@/features/calendar';
import {
  PaymentErrorDialog,
  TrialEndedDialog,
  usePaymentErrorDialog,
  useTrialEndedDialog,
} from '@/features/settings';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

import { DesktopLayout } from './desktop-layout';
import { MobileLayout } from './mobile-layout';

interface BaseLayoutContentProps {
  children: React.ReactNode;
}

/**
 * BaseLayoutのClient Component部分
 *
 * レイアウトのオーケストレーションのみを担当：
 * - デスクトップ/モバイルレイアウトの切り替え
 * - カレンダープロバイダーのラップ
 *
 * ⚠ useSearchParams() は使用しない。
 *   Stats ページでの URL 変更（replaceState）が Suspense 境界を発火し、
 *   子ツリー全体がアンマウントされるバグを防止するため。
 *   カレンダーの searchParams 読み取りは CalendarNavigationProvider 内部で行う。
 */
export function BaseLayoutContent({ children }: BaseLayoutContentProps) {
  const pathname = usePathname() || '/';
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const trialDialog = useTrialEndedDialog();
  const paymentDialog = usePaymentErrorDialog();

  const localeFromPath = useMemo(() => {
    return (pathname.split('/')[1] || 'ja') as 'ja' | 'en';
  }, [pathname]);

  return (
    // CalendarNavigationProvider を常にレンダリングしてツリー構造を安定化。
    // ルート切替時にProvider の付け外しによるリマウントを防ぎ、
    // Sidebar が静止したままメインコンテンツだけが変わる体験を実現する。
    <CalendarNavigationProvider>
      <div className="flex h-screen flex-col">
        {/* アクセシビリティ: スキップリンク */}
        <a
          href="#main-content"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-lg px-4 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
        >
          {t('common.skipToMainContent')}
        </a>

        {isMobile ? (
          <MobileLayout locale={localeFromPath}>{children}</MobileLayout>
        ) : (
          <DesktopLayout locale={localeFromPath}>{children}</DesktopLayout>
        )}
        {/* Trial終了ダイアログ（全ページ共通、1度だけ表示） */}
        <TrialEndedDialog open={trialDialog.open} onClose={trialDialog.close} />
        {/* 決済エラーダイアログ（past_due 時、1日1回表示） */}
        <PaymentErrorDialog open={paymentDialog.open} onClose={paymentDialog.close} />
      </div>
    </CalendarNavigationProvider>
  );
}
