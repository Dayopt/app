'use client';

/**
 * RecentBlocks — 履歴ブロックセクション
 *
 * 直近の使用パターンを頻度×鮮度でスコアリングし、
 * サイドバーに独立セクションとして表示する。
 */

import { useMemo } from 'react';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HoverTooltip } from '@/components/ui/tooltip';
import { useBlockPlace } from '@/features/entry';
import { TagIcon, useTagsMap } from '@/features/tags';
import { api } from '@/platform/trpc';
import { BlockItem, blockMenuButtonCn, SidebarSection } from '@/shell/components/sidebar';

interface RecentBlocksProps {
  onPinItem?: (tagId: string, durationMinutes: number) => void;
}

/** RecentBlocks — サイドバーの履歴ブロックセクション */
export function RecentBlocks({ onPinItem }: RecentBlocksProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { placeBlockNow } = useBlockPlace();

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
    <div className="w-full min-w-0 overflow-hidden px-2">
      <SidebarSection title={t('sidebar.recentBlocks.title')} defaultOpen>
        {itemsWithTags.length === 0 ? (
          <div className="px-2 py-4">
            <p className="text-muted-foreground text-xs">{t('sidebar.recentBlocks.empty')}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('sidebar.recentBlocks.emptyHint')}
            </p>
          </div>
        ) : (
          itemsWithTags.map((item) =>
            item ? (
              <BlockItem
                key={`${item.tagId}-${item.durationMinutes}`}
                tagName={item.tag.name}
                durationMinutes={item.durationMinutes}
                iconSlot={<TagIcon icon={item.tag.icon} color={item.tag.color} size="sm" />}
                onClick={() => placeBlockNow(item.tagId, item.durationMinutes, item.tag.name)}
                menuSlot={
                  onPinItem ? (
                    <HoverTooltip content={t('sidebar.palette.add')}>
                      <button
                        type="button"
                        className={blockMenuButtonCn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPinItem(item.tagId, item.durationMinutes);
                        }}
                        aria-label={t('sidebar.palette.add')}
                      >
                        <Star className="size-3.5" />
                      </button>
                    </HoverTooltip>
                  ) : undefined
                }
              />
            ) : null,
          )
        )}
      </SidebarSection>
    </div>
  );
}
