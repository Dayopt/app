'use client';

/**
 * RecentBlocks — 履歴ブロックセクション
 *
 * 直近の使用パターンを頻度×鮮度でスコアリングし、
 * サイドバーに独立セクションとして表示する。
 */

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { useTagsMap } from '@/features/tags';
import { api } from '@/platform/trpc';
import { SidebarBlockItem } from '@/shell/components/SidebarBlockItem';
import { SidebarSection } from '@/shell/components/SidebarSection';

import { useRecentPlace } from '../hooks/useRecentPlace';

/** RecentBlocks — サイドバーの履歴ブロックセクション */
export function RecentBlocks() {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { handlePlace } = useRecentPlace();

  const { data: recentBlocks } = api.history.getRecentBlocks.useQuery();

  const itemsWithTags = useMemo(
    () =>
      (recentBlocks ?? [])
        .map((item) => {
          const tag = getTagById(item.tagId);
          if (!tag) return null;
          return { ...item, tag };
        })
        .filter(Boolean),
    [recentBlocks, getTagById],
  );

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <SidebarSection title={t('sidebar.recentBlocks.title')} defaultOpen>
        {itemsWithTags.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">
            {t('sidebar.recentBlocks.empty')}
          </p>
        ) : (
          itemsWithTags.map((item) =>
            item ? (
              <SidebarBlockItem
                key={`${item.tagId}-${item.durationMinutes}`}
                tagId={item.tagId}
                tagName={item.tag.name}
                tagColor={item.tag.color}
                durationMinutes={item.durationMinutes}
                tooltipContent={t('sidebar.palette.addToNow')}
                onClick={() => handlePlace(item.tagId, item.durationMinutes, item.tag.name)}
              />
            ) : null,
          )
        )}
      </SidebarSection>
    </div>
  );
}
