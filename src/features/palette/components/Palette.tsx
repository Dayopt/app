'use client';

/**
 * Palette — よく使うブロックのクイック配置
 *
 * サイドバーにSidebarSectionとして表示。
 * ピン留め（手動管理）+ 自動集計の2層で構成。
 * クリックで現在時刻にエントリを配置する。
 */

import { useCallback, useMemo } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SidebarSection } from '@/components/SidebarSection';
import { Button } from '@/components/ui/button';
import { useEntryMutations } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { api } from '@/platform/trpc';

import { PaletteItem } from './PaletteItem';

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

/** Palette — サイドバーのクイックブロック配置セクション */
export function Palette() {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const { createEntry } = useEntryMutations();
  const setTags = api.entries.setTags.useMutation();

  const { data: pinnedItems } = api.palette.list.useQuery();
  const { data: frequentBlocks } = api.palette.getFrequentBlocks.useQuery();

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
            // エントリ作成後にタグを設定
            setTags.mutate({ entryId: newEntry.id, tagId });
          },
        },
      );
    },
    [createEntry, setTags],
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

  const frequentWithTags = useMemo(
    () =>
      (frequentBlocks ?? [])
        .map((item) => {
          const tag = getTagById(item.tagId);
          if (!tag) return null;
          return { ...item, tag };
        })
        .filter(Boolean),
    [frequentBlocks, getTagById],
  );

  const hasItems = pinnedWithTags.length > 0 || frequentWithTags.length > 0;

  return (
    <SidebarSection
      title={t('sidebar.palette.title')}
      defaultOpen
      action={
        <Button variant="ghost" icon className="size-6" aria-label={t('sidebar.palette.add')}>
          <Plus className="size-3.5" />
        </Button>
      }
    >
      {!hasItems && (
        <p className="text-muted-foreground px-2 py-3 text-xs">{t('sidebar.palette.empty')}</p>
      )}

      {/* ピン留めアイテム */}
      {pinnedWithTags.map((item) =>
        item ? (
          <PaletteItem
            key={item.id}
            tagName={item.tag.name}
            tagColor={item.tag.color}
            durationMinutes={item.duration_minutes}
            isPinned
            onClick={() => handlePlace(item.tag_id, item.duration_minutes, item.tag.name)}
          />
        ) : null,
      )}

      {/* 自動集計アイテム */}
      {frequentWithTags.map((item) =>
        item ? (
          <PaletteItem
            key={`${item.tagId}-${item.durationMinutes}`}
            tagName={item.tag.name}
            tagColor={item.tag.color}
            durationMinutes={item.durationMinutes}
            isPinned={false}
            onClick={() => handlePlace(item.tagId, item.durationMinutes, item.tag.name)}
          />
        ) : null,
      )}
    </SidebarSection>
  );
}
