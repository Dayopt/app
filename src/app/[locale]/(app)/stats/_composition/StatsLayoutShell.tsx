'use client';

import { usePathname } from 'next/navigation';

import type { TagTabInfo } from '@/features/stats';
import { StatsLayout } from '@/features/stats';
import { useTag } from '@/features/tags';
import { resolveTagColor } from '@/lib/tag-colors';

type StatsTabId = 'review' | 'progress' | 'badges' | 'insights' | 'tag';

function extractTagId(pathname: string): string | null {
  const match = pathname.match(/\/stats\/tags\/([^/?]+)/);
  return match?.[1] ?? null;
}

function getActiveTab(pathname: string): StatsTabId {
  if (pathname.includes('/stats/tags/')) return 'tag';
  if (pathname.includes('/stats/progress')) return 'progress';
  if (pathname.includes('/stats/badges')) return 'badges';
  if (pathname.includes('/stats/insights')) return 'insights';
  return 'review';
}

interface StatsLayoutShellProps {
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Stats レイアウトシェル（Composition Layer）
 *
 * pathname からアクティブタブを判定し、StatsLayout に渡す。
 * /stats/tags/[tagId] の場合は動的4つ目タブとして表示。
 */
export function StatsLayoutShell({ headerRightExtra, children }: StatsLayoutShellProps) {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);
  const tagId = extractTagId(pathname);

  // タグ情報を取得（tag ページ以外では空文字 → staleTime で無駄なリクエストは発生しない）
  const { data: tag } = useTag(tagId ?? '___skip___');

  const tagTab: TagTabInfo | undefined = tagId
    ? {
        tagId,
        tagName: tag?.name ?? '...',
        tagIcon: tag?.icon ?? null,
        tagColor: resolveTagColor(tag?.color ?? null),
      }
    : undefined;

  const showGranularity = activeTab === 'review' || activeTab === 'tag';

  return (
    <StatsLayout
      activeTab={activeTab}
      tagTab={tagTab}
      showGranularity={showGranularity}
      headerRightExtra={headerRightExtra}
    >
      {children}
    </StatsLayout>
  );
}
