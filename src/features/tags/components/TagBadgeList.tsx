'use client';

/**
 * TagBadgeList
 *
 * タグ選択用の共通 badge リスト。
 * - pill 型 badge の flex-wrap レイアウト
 * - コロン記法のドリルダウン（親 → 子タグ）
 * - 任意で検索ボックス、新規作成 badge を末尾に表示
 * - inlineCreate を渡すと新規作成 badge 押下で InlineTagCreateRow を末尾に inline 展開
 *
 * 外枠（Drawer / Popover / Dialog）は呼び出し側が用意し、中身として差し込む。
 */

import { useCallback, useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/lib/components/ui/input';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { parseColonTag } from '../lib/tag-colon';
import { InlineTagCreateRow } from './InlineTagCreateRow';
import { TagIcon } from './TagIcon';

import type { TagColorName } from '@/lib/tag-colors';
import type { Tag } from '../types';

export interface TagBadgeListHoverInfo {
  id: string;
  name: string;
  color: string | null;
}

export interface TagBadgeListInlineCreateConfig {
  existingTags: Tag[];
  onSubmit: (name: string, color: TagColorName) => void | Promise<void>;
}

export interface TagBadgeListProps {
  tags: Tag[];
  selectedId?: string | null | undefined;
  onSelect: (tagId: string, tagName: string) => void;
  /** 除外するタグID（自身をマージ/再割当候補から外す用途） */
  excludeIds?: readonly string[];
  /** 検索ボックスを上に表示 */
  searchable?: boolean;
  /** コロン記法でのドリルダウンを有効化（default: true） */
  supportDrilldown?: boolean;
  /** 設定すると末尾に破線 badge で新規作成ボタンを表示 */
  onCreate?: (() => void) | undefined;
  /** 末尾の「+」押下で inline 作成フォームを展開。渡さないときは onCreate にフォールバック */
  inlineCreate?: TagBadgeListInlineCreateConfig | undefined;
  /** ホバー時のコールバック（プレビュー用途） */
  onTagHover?: ((info: TagBadgeListHoverInfo | null) => void) | undefined;
  /** role="radiogroup" を付ける（dialog内フォーム用途） */
  asRadioGroup?: boolean;
  /** ARIA label。asRadioGroup または supportDrilldown=false 時に使用 */
  ariaLabel?: string;
  /** 外周 padding。default: 'px-4 py-2' */
  padding?: string;
}

function groupByColonPrefix(tags: Tag[]) {
  const childMap = new Map<string, Tag[]>();
  const topLevel: Tag[] = [];

  for (const tag of tags) {
    const { prefix, suffix } = parseColonTag(tag.name);
    if (suffix !== null) {
      const existing = childMap.get(prefix) ?? [];
      existing.push(tag);
      childMap.set(prefix, existing);
    } else {
      topLevel.push(tag);
    }
  }

  return { topLevel, childrenByPrefix: childMap };
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
        onHover ? () => onHover({ id: tag.id, name: tag.name, color: tag.color }) : undefined
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
      {hasChildren && (
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      )}
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
  inlineCreate,
  onTagHover,
  asRadioGroup = false,
  ariaLabel,
  padding = 'px-4 py-2',
}: TagBadgeListProps) {
  const t = useTranslations('calendar');
  const [view, setView] = useState<{ type: 'grid' } | { type: 'drill'; prefix: string }>({
    type: 'grid',
  });
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const visibleTags = useMemo(() => {
    const filtered = tags.filter((tag) => !excludeSet.has(tag.id));
    if (!query.trim()) return filtered;
    const q = query.toLowerCase();
    return filtered.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, excludeSet, query]);

  const { topLevel, childrenByPrefix } = useMemo(() => {
    if (!supportDrilldown) {
      return { topLevel: visibleTags, childrenByPrefix: new Map<string, Tag[]>() };
    }
    return groupByColonPrefix(visibleTags);
  }, [visibleTags, supportDrilldown]);

  const handleHover = onTagHover ? (info: TagBadgeListHoverInfo) => onTagHover(info) : undefined;
  const handleHoverEnd = onTagHover ? () => onTagHover(null) : undefined;

  const handleCreateBadgeClick = useCallback(() => {
    if (inlineCreate) {
      setIsCreating(true);
    } else if (onCreate) {
      onCreate();
    }
  }, [inlineCreate, onCreate]);

  const handleInlineSubmit = useCallback(
    async (name: string, color: TagColorName) => {
      if (!inlineCreate) return;
      await inlineCreate.onSubmit(name, color);
      setIsCreating(false);
    },
    [inlineCreate],
  );

  const handleInlineCancel = useCallback(() => {
    setIsCreating(false);
  }, []);

  const showCreateButton = Boolean(onCreate || inlineCreate);

  // ドリルダウン画面
  if (view.type === 'drill') {
    const parent = topLevel.find((tag) => tag.name === view.prefix);
    const children = childrenByPrefix.get(view.prefix) ?? [];

    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setView({ type: 'grid' })}
          className="group flex min-h-11 items-center px-4 py-2"
        >
          <span className="group-hover:bg-state-hover flex items-center gap-2 rounded-lg px-2 py-1 transition-colors">
            <ChevronLeft className="text-muted-foreground size-5" />
            {parent && <TagIcon icon={parent.icon} color={parent.color} size="sm" />}
            <span className="text-foreground font-medium">{view.prefix}</span>
          </span>
        </button>

        <div
          className={cn('flex flex-wrap gap-2', padding)}
          role={asRadioGroup ? 'radiogroup' : undefined}
          aria-label={asRadioGroup ? ariaLabel : undefined}
        >
          {parent && (
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
          )}
          {children.map((child) => {
            const { suffix } = parseColonTag(child.name);
            return (
              <TagBadgeCell
                key={child.id}
                tag={child}
                displayName={suffix ?? child.name}
                isSelected={selectedId === child.id}
                hasChildren={false}
                onSelect={() => onSelect(child.id, child.name)}
                onHover={handleHover}
                onHoverEnd={handleHoverEnd}
                asRadio={asRadioGroup}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // メイン画面
  const hasAnyResult = topLevel.length > 0;

  return (
    <div className="flex flex-col">
      {searchable && (
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
      )}

      <div
        className={cn('flex flex-wrap gap-2', padding)}
        role={asRadioGroup ? 'radiogroup' : undefined}
        aria-label={asRadioGroup ? ariaLabel : undefined}
      >
        {isCreating && inlineCreate && (
          <div className="w-full max-w-xs">
            <InlineTagCreateRow
              variant="badge"
              existingTags={inlineCreate.existingTags}
              onSubmit={handleInlineSubmit}
              onCancel={handleInlineCancel}
            />
          </div>
        )}

        {!hasAnyResult && !isCreating && (
          <p className="text-muted-foreground w-full py-6 text-center text-sm">
            {t('tagSelector.noResults')}
          </p>
        )}

        {topLevel.map((tag) => {
          const hasChildren = supportDrilldown && childrenByPrefix.has(tag.name);
          const displayName = supportDrilldown
            ? (parseColonTag(tag.name).suffix ?? tag.name)
            : tag.name;
          return (
            <TagBadgeCell
              key={tag.id}
              tag={tag}
              displayName={displayName}
              isSelected={selectedId === tag.id}
              hasChildren={hasChildren}
              onSelect={() => {
                if (hasChildren) {
                  setView({ type: 'drill', prefix: tag.name });
                } else {
                  onSelect(tag.id, tag.name);
                }
              }}
              onHover={handleHover}
              onHoverEnd={handleHoverEnd}
              asRadio={asRadioGroup}
            />
          );
        })}

        {!isCreating && showCreateButton && (
          <CreateBadge label={t('tagSelector.new')} onClick={handleCreateBadgeClick} />
        )}
      </div>
    </div>
  );
}
