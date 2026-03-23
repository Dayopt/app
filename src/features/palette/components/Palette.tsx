'use client';

/**
 * Palette — ピン留めブロックのクイック配置
 *
 * サイドバーにSidebarSectionとして表示。
 * ピン留め（手動管理）のみ。自動集計は history feature に移管。
 */

import { useCallback, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { toast } from 'sonner';

import { useEntryMutations, useEntryTags } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { api } from '@/platform/trpc';
import { BlockItem, SidebarSection } from '@/shell/components/sidebar';

import { PaletteAddPopover } from './PaletteAddPopover';

const SNAP_MINUTES = 15;

function snapToNextInterval(date: Date): Date {
  const snapped = new Date(date);
  const minutes = snapped.getMinutes();
  const remainder = minutes % SNAP_MINUTES;
  if (remainder > 0) {
    snapped.setMinutes(minutes + (SNAP_MINUTES - remainder));
  }
  snapped.setSeconds(0, 0);
  return snapped;
}

/** Palette — サイドバーのピン留めブロック配置セクション */
export function Palette() {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { createEntry } = useEntryMutations();
  const { setEntryTags } = useEntryTags();

  const { data: pinnedItems } = api.palette.list.useQuery();

  const handlePlace = useCallback(
    (tagId: string, durationMinutes: number, tagName: string) => {
      const now = new Date();
      const start = snapToNextInterval(now);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      createEntry.mutate(
        {
          title: tagName,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: durationMinutes,
        },
        {
          onSuccess: (newEntry) => {
            void setEntryTags(newEntry.id, tagId).then((ok) => {
              if (!ok) toast.error(t('sidebar.palette.tagAssignFailed'));
            });
          },
        },
      );
    },
    [createEntry, setEntryTags, t],
  );

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
    <div className="w-full min-w-0 overflow-hidden">
      <SidebarSection title={t('sidebar.palette.title')} defaultOpen action={<PaletteAddPopover />}>
        {pinnedWithTags.length === 0 && (
          <div className="text-muted-foreground space-y-2 px-2 py-3 text-xs">
            <p>{t('sidebar.palette.empty')}</p>
            <p>{t('sidebar.palette.emptyHint')}</p>
          </div>
        )}

        {/* ピン留めアイテム */}
        {pinnedWithTags.map((item) =>
          item ? (
            <BlockItem
              key={item.id}
              tagId={item.tag_id}
              tagName={item.tag.name}
              tagColor={item.tag.color}
              durationMinutes={item.duration_minutes}
              onClick={() => handlePlace(item.tag_id, item.duration_minutes, item.tag.name)}
            />
          ) : null,
        )}
      </SidebarSection>
    </div>
  );
}
