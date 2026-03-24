'use client';

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';

import { CalendarNavigationProvider, useCalendarProviderProps } from '@/features/calendar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';

import { OfflineIndicator } from '@/shell/providers/OfflineIndicator';

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
 */
export function BaseLayoutContent({ children }: BaseLayoutContentProps) {
  const pathname = usePathname() || '/';
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const searchParams = useSearchParams();

  const localeFromPath = useMemo(() => {
    return (pathname.split('/')[1] || 'ja') as 'ja' | 'en';
  }, [pathname]);

  const { calendarProviderProps } = useCalendarProviderProps(
    pathname,
    searchParams || new URLSearchParams(),
  );

  return (
    // CalendarNavigationProvider を常にレンダリングしてツリー構造を安定化。
    // ルート切替時にProvider の付け外しによるリマウントを防ぎ、
    // Sidebar が静止したままメインコンテンツだけが変わる体験を実現する。
    <CalendarNavigationProvider {...(calendarProviderProps ?? {})}>
      <div className="flex h-screen flex-col">
        {/* オフラインインジケーター */}
        <OfflineIndicator />

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
      </div>
    </CalendarNavigationProvider>
  );
}
