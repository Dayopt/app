'use client';

/**
 * MobileHistoryStrip — モバイル用横スクロール履歴ストリップ
 *
 * BottomTabBar の直上に固定配置。
 * 直近の使用ブロックをチップ形式で横並び表示し、タップで即配置。
 * 履歴なし時は非表示。
 */

import { useMemo } from 'react';

import { useBlockPlace } from '@/features/entry';
import { TagIcon, useTagsMap } from '@/features/tags';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { api } from '@/lib/trpc';

interface MobileHistoryStripProps {
  hidden?: boolean;
}

export function MobileHistoryStrip({ hidden = false }: MobileHistoryStripProps) {
  const { getTagById } = useTagsMap();
  const { placeBlockNow } = useBlockPlace();
  const { data: recentBlocks } = api.history.getRecentBlocks.useQuery();

  const items = useMemo(
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

  if (items.length === 0) return null;

  return (
    <div
      className="border-border z-bottom-strip bg-surface-container pb-safe fixed inset-x-0 border-t transition-transform duration-300"
      // bottom = h-14 (BottomTabBar)
      style={{
        bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
        transform: hidden
          ? 'translateY(calc(100% + 3.5rem + env(safe-area-inset-bottom, 0px)))'
          : 'translateY(0)',
      }}
    >
      <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto overscroll-x-contain px-2 py-1">
        {items.map((item) =>
          item ? (
            <button
              key={`${item.tagId}-${item.durationMinutes}`}
              type="button"
              onClick={() => placeBlockNow(item.tagId, item.durationMinutes, item.tag.name)}
              aria-label={item.tag.name}
              className="hover:bg-state-hover flex w-12 shrink-0 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors duration-150"
            >
              <TagIcon icon={item.tag.icon} color={item.tag.color} size="md" />
              <ColonTagLabel
                name={item.tag.name}
                variant="suffix-only"
                className="text-muted-foreground w-full truncate text-center text-xs leading-tight"
              />
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}
