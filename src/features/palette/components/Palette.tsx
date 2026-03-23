'use client';

/**
 * Palette — ピン留めブロックのクイック配置
 *
 * サイドバーにSidebarSectionとして表示。
 * ピン留め（手動管理）のみ。自動集計は history feature に移管。
 */

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { useBlockPlace } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { BlockItem, SidebarSection } from '@/shell/components/sidebar';

import { usePaletteMutations } from '../hooks/usePaletteMutations';
import { usePaletteItems } from '../hooks/usePaletteQuery';

import { PaletteAddPopover } from './PaletteAddPopover';
import { PaletteItemMenu } from './PaletteItemMenu';

// ─────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────

/** Palette — サイドバーのピン留めブロック配置セクション */
export function Palette() {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { placeBlockNow } = useBlockPlace();
  const { unpinItem, updateDuration } = usePaletteMutations();

  const { data: pinnedItems } = usePaletteItems();

  const pinnedWithTags = useMemo(
    () =>
      (pinnedItems ?? [])
        .map((item) => {
          const tag = getTagById(item.tag_id);
          if (!tag) return null;
          return { ...item, tag };
        })
        .filter(Boolean),
    [pinnedItems, getTagById],
  );

  return (
    <div className="w-full min-w-0 overflow-hidden px-2">
      <SidebarSection
        title={t('sidebar.palette.title')}
        defaultOpen
        action={<PaletteAddPopover pinnedItems={pinnedItems ?? []} />}
      >
        {pinnedWithTags.length === 0 && (
          <div className="text-muted-foreground space-y-2 px-2 py-3 text-xs">
            <p>{t('sidebar.palette.empty')}</p>
            <p>{t('sidebar.palette.emptyHint')}</p>
          </div>
        )}

        {pinnedWithTags.map((item) =>
          item ? (
            <div key={item.id}>
              <BlockItem
                tagName={item.tag.name}
                tagColor={item.tag.color}
                durationMinutes={item.duration_minutes}
                onClick={() => placeBlockNow(item.tag_id, item.duration_minutes, item.tag.name)}
                menuSlot={
                  <PaletteItemMenu
                    itemId={item.id}
                    currentDuration={item.duration_minutes}
                    onChangeDuration={updateDuration}
                    onRemove={unpinItem}
                  />
                }
              />
            </div>
          ) : null,
        )}
      </SidebarSection>
    </div>
  );
}
