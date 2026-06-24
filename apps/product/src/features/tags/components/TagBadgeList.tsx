'use client';

/**
 * TagBadgeList
 *
 * タグ選択用の共通 badge リスト。
 * - pill 型 badge の flex-wrap レイアウト
 * - 親子タグのドリルダウン（親 → 子タグ）
 * - 任意で検索ボックス、新規作成 badge を末尾に表示
 *
 * 外枠（Drawer / Popover / Dialog）は呼び出し側が用意し、中身として差し込む。
 * 新規作成は `onCreate` コールバックで呼び出し側が `TagCreateModal` 等を開く。
 */

import { useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn, Input } from '@dayopt/components';
import { getTagColorClasses } from '../lib/tag-colors';

import { buildTagTree } from '../domain/tag-tree';
import { TagIcon } from './TagIcon';

import type { Tag } from '../types';

interface TagBadgeListHoverInfo {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

interface TagBadgeListProps {
  tags: Tag[];
  selectedId?: string | null | undefined;
  onSelect: (tagId: string, tagName: string) => void;
  excludeIds?: readonly string[];
  searchable?: boolean;
  supportDrilldown?: boolean;
  onCreate?: (() => void) | undefined;
  onTagHover?: ((info: TagBadgeListHoverInfo | null) => void) | undefined;
  asRadioGroup?: boolean;
  ariaLabel?: string;
  padding?: string;
}

interface TagBadgeCellProps {
  tag: Tag;
  displayName: string;
  isSelected: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onHover?: ((info: TagBadgeListHoverInfo) => void) | undefined;
  onHoverEnd?: (() => void) | undefined;
  asRadio?: boolean;
}

function TagBadgeCell({
  tag,
  displayName,
  isSelected,
  hasChildren,
  onSelect,
  onHover,
  onHoverEnd,
  asRadio = false,
}: TagBadgeCellProps) {
  const colorClasses = getTagColorClasses(tag.color);

  const selectedStyle = isSelected
    ? {
        borderColor: colorClasses.cssVar,
        backgroundColor: colorClasses.cssVarTint,
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={
        onHover
          ? () => onHover({ id: tag.id, name: tag.name, color: tag.color, icon: tag.icon })
          : undefined
      }
      onMouseLeave={onHoverEnd}
      role={asRadio ? 'radio' : undefined}
      aria-checked={asRadio ? isSelected : undefined}
      className={cn(
        'flex min-h-11 items-center gap-1 rounded-full border px-3 py-2 text-sm transition-colors',
        'active:scale-95 active:transition-transform',
        isSelected ? 'text-foreground' : 'border-border text-foreground hover:bg-state-hover',
      )}
      style={selectedStyle}
    >
      <TagIcon icon={tag.icon} color={tag.color} size="sm" />
      <span className="truncate">{displayName}</span>
      {hasChildren ? (
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function CreateBadge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-border hover:bg-state-hover text-muted-foreground flex min-h-11 items-center gap-1 rounded-full border border-dashed px-3 py-2 text-sm transition-colors',
        'active:scale-95 active:transition-transform',
      )}
    >
      <Plus className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function TagBadgeList({
  tags,
  selectedId,
  onSelect,
  excludeIds,
  searchable = false,
  supportDrilldown = true,
  onCreate,
  onTagHover,
  asRadioGroup = false,
  ariaLabel,
  padding = 'px-4 py-2',
}: TagBadgeListProps) {
  const t = useTranslations('calendar');
  const [view, setView] = useState<{ type: 'grid' } | { type: 'drill'; parentId: string }>({
    type: 'grid',
  });
  const [query, setQuery] = useState('');

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const visibleTags = useMemo(() => {
    const filtered = tags.filter((tag) => !excludeSet.has(tag.id));
    if (!query.trim()) return filtered;
    const q = query.toLowerCase();
    return filtered.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, excludeSet, query]);

  const tree = useMemo(() => {
    // drilldown 非対応モード（タグ再割当て等のフラットピッカー）では
    // 親 / 子を区別せず全タグを兄弟として並べる。`parent_id === null` で
    // フィルタすると階層を持つユーザーが子タグを選択できなくなる。
    if (!supportDrilldown) {
      return visibleTags.map((tag) => ({ tag, children: [] }));
    }
    return buildTagTree(visibleTags);
  }, [visibleTags, supportDrilldown]);

  const handleHover = onTagHover ? (info: TagBadgeListHoverInfo) => onTagHover(info) : undefined;
  const handleHoverEnd = onTagHover ? () => onTagHover(null) : undefined;

  const showCreateButton = Boolean(onCreate);

  if (view.type === 'drill') {
    const parentNode = tree.find((node) => node.tag.id === view.parentId);
    const parent = parentNode?.tag;
    const children = parentNode?.children ?? [];

    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setView({ type: 'grid' })}
          className="group flex min-h-11 items-center px-4 py-2"
        >
          <span className="group-hover:bg-state-hover flex items-center gap-2 rounded-lg px-2 py-1 transition-colors">
            <ChevronLeft className="text-muted-foreground size-5" />
            {parent ? <TagIcon icon={parent.icon} color={parent.color} size="sm" /> : null}
            <span className="text-foreground font-medium">{parent?.name ?? ''}</span>
          </span>
        </button>

        <div
          className={cn('flex flex-wrap gap-2', padding)}
          role={asRadioGroup ? 'radiogroup' : undefined}
          aria-label={asRadioGroup ? ariaLabel : undefined}
        >
          {parent ? (
            <TagBadgeCell
              tag={parent}
              displayName={parent.name}
              isSelected={selectedId === parent.id}
              hasChildren={false}
              onSelect={() => onSelect(parent.id, parent.name)}
              onHover={handleHover}
              onHoverEnd={handleHoverEnd}
              asRadio={asRadioGroup}
            />
          ) : null}
          {children.map((child) => (
            <TagBadgeCell
              key={child.id}
              tag={child}
              displayName={child.name}
              isSelected={selectedId === child.id}
              hasChildren={false}
              onSelect={() => onSelect(child.id, child.name)}
              onHover={handleHover}
              onHoverEnd={handleHoverEnd}
              asRadio={asRadioGroup}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {searchable ? (
        <div className={cn('relative', padding)}>
          <Search className="text-muted-foreground absolute top-1/2 left-6 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tagSelector.searchPlaceholder')}
            aria-label={t('tagSelector.searchPlaceholder')}
            className="pl-8"
          />
        </div>
      ) : null}

      <div
        className={cn('flex flex-wrap gap-2', padding)}
        role={asRadioGroup ? 'radiogroup' : undefined}
        aria-label={asRadioGroup ? ariaLabel : undefined}
      >
        {tree.length === 0 ? (
          <p className="text-muted-foreground w-full py-6 text-center text-sm">
            {t('tagSelector.noResults')}
          </p>
        ) : null}

        {tree.map(({ tag, children }) => (
          <TagBadgeCell
            key={tag.id}
            tag={tag}
            displayName={tag.name}
            isSelected={selectedId === tag.id}
            hasChildren={supportDrilldown && children.length > 0}
            onSelect={() => {
              if (supportDrilldown && children.length > 0) {
                setView({ type: 'drill', parentId: tag.id });
                return;
              }
              onSelect(tag.id, tag.name);
            }}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
            asRadio={asRadioGroup}
          />
        ))}

        {showCreateButton ? (
          <CreateBadge label={t('tagSelector.new')} onClick={() => onCreate?.()} />
        ) : null}
      </div>
    </div>
  );
}
