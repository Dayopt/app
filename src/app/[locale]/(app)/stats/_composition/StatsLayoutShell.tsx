'use client';

import { usePathname } from 'next/navigation';

import { StatsLayout } from '@/features/stats';

type StatsTabId = 'review' | 'progress' | 'insights';

function getActiveTab(pathname: string): StatsTabId | null {
  if (pathname.includes('/stats/review')) return 'review';
  if (pathname.includes('/stats/progress')) return 'progress';
  if (pathname.includes('/stats/insights')) return 'insights';
  return null;
}

interface StatsLayoutShellProps {
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Stats レイアウトシェル（Composition Layer）
 *
 * pathname からアクティブタブを判定し、StatsLayout に渡す。
 * /stats/tags/[tagId] の場合はタブバーなしで children のみ表示。
 */
export function StatsLayoutShell({ headerRightExtra, children }: StatsLayoutShellProps) {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);

  // タグ詳細ページなどタブに該当しないルートは children をそのまま表示
  if (!activeTab) {
    return <>{children}</>;
  }

  return (
    <StatsLayout
      activeTab={activeTab}
      showGranularity={activeTab === 'review'}
      headerRightExtra={headerRightExtra}
    >
      {children}
    </StatsLayout>
  );
}
