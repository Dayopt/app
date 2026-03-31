'use client';

/**
 * TagGridPicker — グリッド型タグ選択UI（共通コンポーネント）
 *
 * 3列グリッドでタグを表示。子タグはドリルダウンで遷移。
 * TagQuickSelector, PaletteAddPopover 等で再利用。
 */

import { useCallback, useMemo, useState } from 'react';

import { Check, ChevronLeft } from 'lucide-react';

import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { parseColonTag } from '../lib/tag-colon';

import type { Tag } from '../types';

import { TagIcon } from './TagIcon';

// ─────────────────────────────────────────────────────────
// Grid Cell
// ─────────────────────────────────────────────────────────

function TagGridCell({
  tag,
  isSelected = false,
  hasChildren = false,
  onSelect,
}: {
  tag: Tag;
  isSelected?: boolean;
  hasChildren?: boolean;
  onSelect: () => void;
}) {
  const colorClasses = getTagColorClasses(tag.color);
  const displayName = parseColonTag(tag.name).suffix ?? tag.name;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl p-2 transition-colors',
        'active:scale-95 active:transition-transform',
        isSelected ? 'ring-primary ring-2' : 'hover:brightness-95',
        colorClasses.tint,
      )}
    >
      <div className="relative flex size-8 items-center justify-center">
        <TagIcon icon={tag.icon} color={tag.color} size="lg" />
        {isSelected && <Check className="absolute inset-0 m-auto size-4 text-white" />}
      </div>
      <span className="text-foreground flex w-full items-center justify-center gap-1 text-sm font-medium">
        <span className="truncate">{displayName}</span>
        {hasChildren && (
          <ChevronLeft className="text-muted-foreground size-4 shrink-0 rotate-180" />
        )}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// TagGridPicker
// ─────────────────────────────────────────────────────────

type GridView = { type: 'grid' } | { type: 'drill'; prefix: string };

interface TagGridPickerProps {
  /** タグ一覧（アクティブ・ソート済み） */
  tags: Tag[];
  /** 選択中のタグID */
  selectedId?: string | null;
  /** タグ選択コールバック */
  onSelect: (tagId: string, tagName: string) => void;
}

export function TagGridPicker({ tags, selectedId, onSelect }: TagGridPickerProps) {
  const [view, setView] = useState<GridView>({ type: 'grid' });

  // コロン記法でグルーピング
  const { topLevelTags, childrenByPrefix } = useMemo(() => {
    const childMap = new Map<string, Tag[]>();
    const flatTags: Tag[] = [];
    const flatNames = new Set<string>();

    for (const tag of tags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        const existing = childMap.get(prefix) ?? [];
        existing.push(tag);
        childMap.set(prefix, existing);
      } else {
        flatTags.push(tag);
        flatNames.add(tag.name);
      }
    }

    // 子タグのみ存在するprefix（対応する親タグがない）をトップレベルに追加
    // 最初の子タグの色・アイコンを継承した仮想親エントリとして表示
    for (const [prefix, children] of childMap) {
      if (!flatNames.has(prefix) && children.length > 0) {
        const first = children[0]!;
        flatTags.push({
          ...first,
          id: `__virtual_${prefix}`,
          name: prefix,
        });
      }
    }

    return { topLevelTags: flatTags, childrenByPrefix: childMap };
  }, [tags]);

  const handleSelect = useCallback(
    (tagId: string, tagName: string) => {
      onSelect(tagId, tagName);
    },
    [onSelect],
  );

  // ドリルダウン画面
  if (view.type === 'drill') {
    const children = childrenByPrefix.get(view.prefix) ?? [];
    const parentTag = topLevelTags.find((t) => t.name === view.prefix);

    return (
      <div className="flex flex-col">
        {/* ← 戻るヘッダー */}
        <button
          type="button"
          onClick={() => setView({ type: 'grid' })}
          className="group flex min-h-11 items-center px-4 py-2"
        >
          <span className="group-hover:bg-state-hover flex items-center gap-2 rounded-lg px-2 py-1 transition-colors">
            <ChevronLeft className="text-muted-foreground size-5" />
            <TagIcon icon={parentTag?.icon ?? null} color={parentTag?.color ?? null} size="sm" />
            <span className="text-foreground font-semibold">{view.prefix}</span>
          </span>
        </button>

        <div className="grid grid-cols-4 gap-2 px-4 py-2">
          {parentTag && !parentTag.id.startsWith('__virtual_') && (
            <TagGridCell
              tag={parentTag}
              isSelected={selectedId === parentTag.id}
              onSelect={() => handleSelect(parentTag.id, parentTag.name)}
            />
          )}
          {children.map((child) => (
            <TagGridCell
              key={child.id}
              tag={child}
              isSelected={selectedId === child.id}
              onSelect={() => handleSelect(child.id, child.name)}
            />
          ))}
        </div>
      </div>
    );
  }

  // メイングリッド
  return (
    <div className="grid grid-cols-4 gap-2">
      {topLevelTags.map((tag) => {
        const hasChildren = childrenByPrefix.has(tag.name);
        return (
          <TagGridCell
            key={tag.id}
            tag={tag}
            isSelected={selectedId === tag.id}
            hasChildren={hasChildren}
            onSelect={() => {
              if (hasChildren) {
                setView({ type: 'drill', prefix: tag.name });
              } else {
                handleSelect(tag.id, tag.name);
              }
            }}
          />
        );
      })}
    </div>
  );
}
