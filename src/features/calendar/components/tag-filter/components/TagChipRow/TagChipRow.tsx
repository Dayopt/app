'use client';

import { useMemo, useState } from 'react';

import { TagIcon, useTags, type Tag } from '@/features/tags';
import { cn } from '@/lib/utils';

import { TagEntryCreatePopover } from '../TagEntryCreatePopover';

export interface TagChipRowProps {
  /** 既定の duration（分）。popover の end time 初期値 = start + this */
  defaultDurationMinutes?: number;
  /** BottomTabBar auto-hide と同期して隠す */
  hidden?: boolean;
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
 * - タイムライン下部・タブバー上に横一列で並ぶ（親タグ・葉タグ混在）
 * - タップで bottom sheet の `TagEntryCreatePopover` を開き、時刻指定してエントリ作成
 * - データソース: `useTags()`（sidebar と同じ cache を参照、追加 fetch ゼロ）
 * - 並び順: `sort_order` 昇順（PC sidebar と完全一致）
 * - 葉タグは suffix のみ表示（icon + color で親を識別）
 * - `is_active === false` のタグは除外
 * - タグゼロなら null を返す（行ごと非表示）
 */
export function TagChipRow({
  defaultDurationMinutes = 30,
  hidden = false,
  className,
}: TagChipRowProps) {
  const { data: tags } = useTags();
  const [openTagId, setOpenTagId] = useState<string | null>(null);

  const sortedTags = useMemo(() => sortActiveTags(tags), [tags]);
  const openTag = useMemo(
    () => sortedTags.find((t) => t.id === openTagId) ?? null,
    [sortedTags, openTagId],
  );

  if (sortedTags.length === 0) return null;

  return (
    <div
      className={cn(
        'bg-surface-container border-border-subtle z-bottom-tab fixed inset-x-0 flex h-14 items-center gap-1 overflow-x-auto border-t px-2 transition-transform duration-300',
        // タップ領域を広く保ちつつ、横スクロール時のバウンスを抑える
        'overscroll-x-contain',
        className,
      )}
      style={{
        bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
        transform: hidden
          ? 'translateY(calc(100% + 3.5rem + env(safe-area-inset-bottom, 0px)))'
          : 'translateY(0)',
      }}
      role="list"
      aria-label="タグクイック作成"
    >
      {sortedTags.map((tag) => {
        const label = tag.name;
        return (
          <button
            key={tag.id}
            type="button"
            role="listitem"
            onClick={() => setOpenTagId(tag.id)}
            className="hover:bg-state-hover flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors duration-150"
          >
            <TagIcon icon={tag.icon} color={tag.color} size="md" />
            <span className="text-muted-foreground max-w-16 truncate text-xs">{label}</span>
          </button>
        );
      })}

      {openTag && (
        <TagEntryCreatePopover
          open={true}
          onOpenChange={(o) => {
            if (!o) setOpenTagId(null);
          }}
          tag={openTag}
          defaultDurationMinutes={defaultDurationMinutes}
          isMobile
        />
      )}
    </div>
  );
}
