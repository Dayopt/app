'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { isCalendarViewPath } from '@/features/calendar';
import { InsightsView, ProgressView, StatsView } from '@/features/stats';
import { FeatureErrorBoundary } from '@/lib/components/common/error-boundary';
import { useClientRouterStore } from '@/lib/stores/useClientRouterStore';
import { SidebarPageNav } from '../_shell/SidebarPageNav';

import { CalendarViewClient } from '../calendar/_composition/CalendarViewClient';
import { StatsLayoutShell } from '../stats/_composition/StatsLayoutShell';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripLocale(pathname: string): string {
  const segments = pathname.split('/');
  return segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
    ? '/' + segments.slice(2).join('/')
    : pathname;
}

function getPageType(pathname: string): 'calendar' | 'stats' | null {
  const pathWithoutLocale = stripLocale(pathname);

  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  if (pathWithoutLocale.startsWith('/stats')) return 'stats';
  return null;
}

function getStatsTab(pathname: string): 'review' | 'progress' | 'insights' {
  const pathWithoutLocale = stripLocale(pathname);
  if (pathWithoutLocale.startsWith('/stats/progress')) return 'progress';
  if (pathWithoutLocale.startsWith('/stats/insights')) return 'insights';
  return 'review';
}

// ---------------------------------------------------------------------------
// Sub-views (client-side rendered)
// ---------------------------------------------------------------------------

function CalendarClientView() {
  const t = useTranslations();

  const translations = useMemo(
    () => ({
      errorTitle: t('calendar.errors.loadFailed'),
      errorMessage: t('calendar.errors.displayFailed'),
      reloadButton: t('common.reload'),
    }),
    [t],
  );

  return <CalendarViewClient translations={translations} />;
}

function StatsClientView() {
  const pathname = usePathname();
  const tab = getStatsTab(pathname);

  const featureName =
    tab === 'progress' ? 'stats-progress' : tab === 'insights' ? 'stats-insights' : 'stats';

  return (
    <StatsLayoutShell headerRightExtra={<SidebarPageNav />}>
      <FeatureErrorBoundary featureName={featureName}>
        {tab === 'progress' ? (
          <ProgressView />
        ) : tab === 'insights' ? (
          <InsightsView />
        ) : (
          <StatsView />
        )}
      </FeatureErrorBoundary>
    </StatsLayoutShell>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ClientPageRouterProps {
  children: React.ReactNode;
}

/**
 * クライアントサイドページ切り替え
 *
 * 初回ロード / リロード時は Next.js が SSR した {children} をそのまま表示。
 * PageNav が pushState + useClientRouterStore.switchToPage() を呼ぶと、
 * Calendar / Stats をクライアントサイドで直接レンダリングする。
 *
 * これにより router.push() のサーバーラウンドトリップを回避し、
 * ChatGPT ライクな「Sidebar 静止 / メインのみ切り替え」体験を実現する。
 */
export function ClientPageRouter({ children }: ClientPageRouterProps) {
  const pathname = usePathname();
  const clientPage = useClientRouterStore((s) => s.clientPage);
  const switchToPage = useClientRouterStore((s) => s.switchToPage);
  const resetToServer = useClientRouterStore((s) => s.resetToServer);

  // ブラウザ戻る/進む時: popstate イベントで clientPage を同期
  useEffect(() => {
    const handlePopState = () => {
      const pageType = getPageType(window.location.pathname);
      if (pageType === 'calendar' || pageType === 'stats') {
        switchToPage(pageType);
      } else {
        resetToServer();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [switchToPage, resetToServer]);

  // router.push で URL が変わった場合、clientPage と実際のパスが不一致なら
  // サーバーレンダリングにフォールバック（例: /stats/tags/[tagId] 等のサブルート遷移）
  const actualPageType = getPageType(pathname);
  if (clientPage && clientPage !== actualPageType) {
    return <>{children}</>;
  }

  if (clientPage === 'calendar') {
    return <CalendarClientView />;
  }

  if (clientPage === 'stats') {
    return <StatsClientView />;
  }

  return <>{children}</>;
}
