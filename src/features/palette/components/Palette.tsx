'use client';

/**
 * Palette — ピン留めブロックのクイック配置
 *
 * サイドバーにSidebarSectionとして表示。
 * ピン留め（手動管理）のみ。自動集計は history feature に移管。
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { HoverTooltip } from '@/components/ui/tooltip';
import { useBlockPlace } from '@/features/entry';
import { TagIcon, useTagsMap } from '@/features/tags';
import { BlockItem, SidebarSection } from '@/shell/components/sidebar';

import { usePaletteMutations } from '../hooks/usePaletteMutations';
import { usePaletteItems } from '../hooks/usePaletteQuery';

import { PaletteAddPopover } from './PaletteAddPopover';
import { PaletteItemMenu } from './PaletteItemMenu';

// ─────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────

interface PaletteProps {
  /** 外部で追加フローを制御する場合のコールバック（モバイルシート内ビュー切り替え等） */
  onAddClick?: (() => void) | undefined;
}

/** Palette — サイドバーのピン留めブロック配置セクション */
export function Palette({ onAddClick }: PaletteProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { placeBlockNow } = useBlockPlace();
  const { unpinItem, updateDuration } = usePaletteMutations();

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

  // PaletteAddPopover: trigger + open state をここで管理
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const handleAddClick = useCallback(() => {
    if (onAddClick) {
      onAddClick();
    } else {
      setAddPopoverOpen(true);
    }
  }, [onAddClick]);

  const addTrigger = (
    <Button
      ref={addButtonRef}
      variant="ghost"
      icon
      className="size-6"
      aria-label={t('sidebar.palette.add')}
      onClick={handleAddClick}
    >
      <Plus className="size-4" />
    </Button>
  );

  const hasItems = validItems.length > 0 || orphanItems.length > 0;

  return (
    <div className="w-full min-w-0 overflow-hidden px-2">
      <SidebarSection title={t('sidebar.palette.title')} defaultOpen action={addTrigger}>
        {!hasItems && (
          <div className="text-muted-foreground space-y-2 px-2 py-3 text-xs">
            <p>{t('sidebar.palette.empty')}</p>
            <p>{t('sidebar.palette.emptyHint')}</p>
          </div>
        )}

        {validItems.map((item) => (
          <div key={item.id}>
            <BlockItem
              tagName={item.tag.name}
              tagColor={item.tag.color}
              durationMinutes={item.duration_minutes}
              iconSlot={<TagIcon icon={item.tag.icon} color={item.tag.color} size="sm" />}
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
        ))}

        {orphanItems.map((item) => (
          <div key={item.id}>
            <BlockItem
              tagName={t('sidebar.palette.tagDeleted')}
              tagColor="gray"
              durationMinutes={item.duration_minutes}
              disabled
              menuSlot={
                <HoverTooltip content={t('sidebar.palette.remove')}>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors"
                    onClick={() => unpinItem(item.id)}
                    aria-label={t('sidebar.palette.remove')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </HoverTooltip>
              }
            />
          </div>
        ))}
      </SidebarSection>

      <PaletteAddPopover
        open={addPopoverOpen}
        onOpenChange={setAddPopoverOpen}
        anchorRef={addButtonRef}
        pinnedItems={pinnedItems ?? []}
      />
    </div>
  );
}
