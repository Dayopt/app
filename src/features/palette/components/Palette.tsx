'use client';

/**
 * Palette — ピン留めブロックのクイック配置
 *
 * サイドバーにSidebarSectionとして表示。
 * ピン留め（手動管理）のみ。自動集計は history feature に移管。
 */

import { useMemo } from 'react';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HoverTooltip } from '@/components/ui/tooltip';
import { useBlockPlace } from '@/features/entry';
import { TagIcon, useTagsMap } from '@/features/tags';
import { BlockItem, blockMenuButtonCn, SidebarSection } from '@/shell/components/sidebar';

import { usePaletteMutations } from '../hooks/usePaletteMutations';
import { usePaletteItems } from '../hooks/usePaletteQuery';

// ─────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────

/** Palette — サイドバーのピン留めブロック配置セクション */
export function Palette() {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { placeBlockNow } = useBlockPlace();
  const { unpinItem } = usePaletteMutations();

  const { data: pinnedItems } = usePaletteItems();

  // タグが存在するアイテムと、削除済みタグの孤立アイテムを分離
  const { validItems, orphanItems } = useMemo(() => {
    const valid: {
      id: string;
      tag_id: string;
      duration_minutes: number;
      sort_order: number;
      is_pinned: boolean;
      tag: { id: string; name: string; color: string; icon: string | null };
    }[] = [];
    const orphans: {
      id: string;
      tag_id: string;
      duration_minutes: number;
      sort_order: number;
      is_pinned: boolean;
    }[] = [];

    for (const item of pinnedItems ?? []) {
      const tag = getTagById(item.tag_id);
      if (tag) {
        valid.push({ ...item, tag });
      } else {
        orphans.push(item);
      }
    }

    return { validItems: valid, orphanItems: orphans };
  }, [pinnedItems, getTagById]);

  const hasItems = validItems.length > 0 || orphanItems.length > 0;

  const deleteButton = (itemId: string) => (
    <HoverTooltip content={t('sidebar.palette.remove')}>
      <button
        type="button"
        className={blockMenuButtonCn}
        onClick={(e) => {
          e.stopPropagation();
          unpinItem(itemId);
        }}
        aria-label={t('sidebar.palette.remove')}
      >
        <Trash2 className="size-3.5" />
      </button>
    </HoverTooltip>
  );

  return (
    <div className="w-full min-w-0 overflow-hidden px-2">
      <SidebarSection title={t('sidebar.palette.title')} defaultOpen>
        {!hasItems && (
          <div className="text-muted-foreground space-y-2 px-2 py-4 text-xs">
            <p>{t('sidebar.palette.empty')}</p>
            <p>{t('sidebar.palette.emptyHint')}</p>
          </div>
        )}

        {validItems.map((item) => (
          <div key={item.id}>
            <BlockItem
              tagName={item.tag.name}
              durationMinutes={item.duration_minutes}
              iconSlot={<TagIcon icon={item.tag.icon} color={item.tag.color} size="sm" />}
              onClick={() => placeBlockNow(item.tag_id, item.duration_minutes, item.tag.name)}
              menuSlot={deleteButton(item.id)}
            />
          </div>
        ))}

        {orphanItems.map((item) => (
          <div key={item.id}>
            <BlockItem
              tagName={t('sidebar.palette.tagDeleted')}
              durationMinutes={item.duration_minutes}
              iconSlot={<TagIcon icon={null} color="gray" size="sm" />}
              disabled
              menuSlot={deleteButton(item.id)}
            />
          </div>
        ))}
      </SidebarSection>
    </div>
  );
}
