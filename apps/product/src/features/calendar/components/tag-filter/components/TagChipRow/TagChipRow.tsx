'use client';

import { useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TagIcon, useTags, type Tag } from '@/features/tags';
import { useShellStore } from '@/lib/stores/useShellStore';
import { cn } from '@dayopt/components';

import { TagTimeblockCreatePopover } from '../TagTimeblockCreatePopover';

interface TagChipRowProps {
  className?: string;
}

/** useTags() は hierarchy flatten 済み順を返すため、その順序を維持して active のみ抽出する。 */
function sortActiveTags(tags: Tag[] | undefined): Tag[] {
  if (!tags) return [];
  return tags.filter((tag) => tag.is_active !== false);
}

/**
 * モバイル専用タグチップ行。
 *
 * - タイムライン下部の固定フッターに横一列で並ぶ（親タグ・葉タグ混在）
 * - タップで bottom sheet `TagTimeblockCreatePopover` を開き、時刻指定してエントリ作成
 * - 行末に「+」ボタンを置き `useShellStore.openTagCreateModal()` で新規タグ作成
 * - データソース: `useTags()`（sidebar と同じ cache を参照、追加 fetch ゼロ）
 * - 並び順: `sort_order` 昇順（PC sidebar と完全一致）
 * - 葉タグは suffix のみ表示（icon + color で親を識別）
 * - `is_active === false` のタグは除外
 * - タグゼロなら null を返す（行ごと非表示。初回タグ作成は別導線）
 */
export function TagChipRow({ className }: TagChipRowProps) {
  const t = useTranslations();
  const { data: tags } = useTags();
  const [openTagId, setOpenTagId] = useState<string | null>(null);

  const openTagCreateModal = useShellStore.use.openTagCreateModal();

  const sortedTags = useMemo(() => sortActiveTags(tags), [tags]);
  const openTag = useMemo(
    () => sortedTags.find((tag) => tag.id === openTagId) ?? null,
    [sortedTags, openTagId],
  );

  if (sortedTags.length === 0) return null;

  const handleTagTap = (tagId: string) => {
    setOpenTagId(tagId);
  };

  return (
    <div
      className={cn(
        'bg-surface-container border-border-subtle z-bottom-tab pb-safe fixed inset-x-0 bottom-0 flex min-h-14 items-center gap-1 overflow-x-auto border-t px-2 pt-1',
        // タップ領域を広く保ちつつ、横スクロール時のバウンスを抑える + スクロールバー非表示
        'scrollbar-hide overscroll-x-contain',
        className,
      )}
      role="list"
      aria-label={t('calendar.filter.quickCreate')}
    >
      {sortedTags.map((tag) => {
        const label = tag.name;
        return (
          <button
            key={tag.id}
            type="button"
            role="listitem"
            onClick={() => handleTagTap(tag.id)}
            className="hover:bg-state-hover flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150"
          >
            <TagIcon icon={tag.icon} color={tag.color} size="md" />
            <span className="text-muted-foreground max-w-16 truncate text-xs">{label}</span>
          </button>
        );
      })}

      <button
        type="button"
        role="listitem"
        aria-label={t('calendar.filter.createTag')}
        onClick={() => openTagCreateModal()}
        className="hover:bg-state-hover text-muted-foreground flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150"
      >
        <Plus className="size-5" />
        <span className="max-w-16 truncate text-xs">{t('common.actions.add')}</span>
      </button>

      {openTag && (
        <TagTimeblockCreatePopover
          open={true}
          onOpenChange={(o) => {
            if (!o) setOpenTagId(null);
          }}
          tag={openTag}
          isMobile
        />
      )}
    </div>
  );
}
