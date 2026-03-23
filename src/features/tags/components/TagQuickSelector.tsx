'use client';

/**
 * TagQuickSelector
 *
 * タグ選択用フローティングパネル。
 * ラジオボタン型の単一選択 + 検索 + 新規作成。
 * overlayなし — 背景コンテンツが見える状態を維持。
 * モバイル: Vaul Drawer（スワイプで閉じる）、PC: アンカー横フローティング。
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Plus, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { useTags } from '../hooks/useTagsQuery';
import { parseColonTag } from '../lib/tag-colon';

import type { TagColorName } from '@/lib/tag-colors';

import type { Tag } from '../types';

import { TagRadioItem } from './TagRadioItem';

/** タグが0件のときにユーザーへ表示するサンプルタグ候補一覧 */
const SAMPLE_TAG_CHIPS: Array<{ nameKey: string; color: TagColorName }> = [
  { nameKey: 'work', color: 'blue' },
  { nameKey: 'study', color: 'indigo' },
  { nameKey: 'exercise', color: 'green' },
  { nameKey: 'break', color: 'amber' },
  { nameKey: 'meal', color: 'orange' },
];

/** ホバー中のタグ情報 */
export interface HoveredTagInfo {
  id: string;
  name: string;
  color: string | null;
}

interface TagQuickSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (tagId: string, tagName: string) => void;
  onCreateAndSelect: (name: string, color?: string | null) => void;
  /** タグホバー時のコールバック（プレビュー用） */
  onTagHover?: ((tag: HoveredTagInfo | null) => void) | undefined;
  /** PC: アンカー要素の横にパネルを配置する */
  anchorRef?: React.RefObject<HTMLDivElement | HTMLButtonElement | null>;
}

/**
 * 共通コンテンツ部分
 */
function TagQuickSelectorContent({
  onSelect,
  onCreateAndSelect,
  onTagHover,
}: {
  onSelect: (tagId: string, tagName: string) => void;
  onCreateAndSelect: (name: string, color?: string | null) => void;
  onTagHover?: ((tag: HoveredTagInfo | null) => void) | undefined;
}) {
  const t = useTranslations('calendar');
  const { data: tags } = useTags();
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [newTagName, setNewTagName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // アクティブなタグのみ、ソート済み
  const sortedTags = useMemo(() => {
    const active = (tags ?? []).filter((tag) => tag.is_active !== false);
    return [...active].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [tags]);

  // 検索フィルタリング（deferred でグルーピング計算の頻度を抑制）
  const filteredTags = useMemo(() => {
    if (!deferredSearchQuery) return sortedTags;
    const q = deferredSearchQuery.toLowerCase();
    return sortedTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [sortedTags, deferredSearchQuery]);

  // コロン記法でグルーピング
  // prefix と完全一致するタグがあれば親タグとして使用
  const { groups, ungrouped } = useMemo(() => {
    const prefixMap = new Map<string, { parent: Tag | null; children: Tag[] }>();
    const noColon: Tag[] = [];

    // 1パス: コロン付きを子としてグルーピング、コロンなしは候補として保持
    for (const tag of filteredTags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        const existing = prefixMap.get(prefix) ?? { parent: null, children: [] };
        existing.children.push(tag);
        prefixMap.set(prefix, existing);
      } else {
        noColon.push(tag);
      }
    }

    // 2パス: noColon の中で prefix と完全一致するタグを親に昇格
    const ungroupedResult: Tag[] = [];
    for (const tag of noColon) {
      const group = prefixMap.get(tag.name);
      if (group) {
        group.parent = tag;
      } else {
        ungroupedResult.push(tag);
      }
    }

    return { groups: prefixMap, ungrouped: ungroupedResult };
  }, [filteredTags]);

  const handleSelect = useCallback(
    (tagId: string, tagName: string) => {
      setSelectedId(tagId);
      onSelect(tagId, tagName);
    },
    [onSelect],
  );

  const handleCreateSubmit = useCallback(() => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    onCreateAndSelect(trimmed);
  }, [newTagName, onCreateAndSelect]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateSubmit();
      }
    },
    [handleCreateSubmit],
  );

  const handleHover = useCallback((tag: HoveredTagInfo) => onTagHover?.(tag), [onTagHover]);

  const handleHoverEnd = useCallback(() => onTagHover?.(null), [onTagHover]);

  const hasResults = filteredTags.length > 0;
  const isTagZero = sortedTags.length === 0;

  return (
    <>
      {/* Search — タグゼロ時は非表示 */}
      {!isTagZero && (
        <div className="border-border border-b px-4 py-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('tagSelector.searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Tag list */}
      <div
        className="overflow-y-auto px-1 py-2"
        style={{ maxHeight: '50vh' }}
        role="radiogroup"
        aria-label={t('tagSelector.title')}
      >
        {/* タグゼロ時: サンプルタグ候補チップ */}
        {isTagZero && (
          <div className="space-y-3 px-3 py-4">
            <div className="text-center">
              <p className="text-foreground text-sm font-medium">{t('tagSelector.emptyTitle')}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('tagSelector.emptyDescription')}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SAMPLE_TAG_CHIPS.map(({ nameKey, color }) => {
                const name = t(`tagSelector.sampleTags.${nameKey}`);
                return (
                  <button
                    key={nameKey}
                    type="button"
                    onClick={() => onCreateAndSelect(name, color)}
                    className="border-border hover:bg-state-hover flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: `var(--tag-${color})` }}
                    />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 検索結果なし（タグはあるが検索にマッチしない） */}
        {!isTagZero && !hasResults && (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            {t('tagSelector.noResults')}
          </p>
        )}

        {/* Grouped tags */}
        {[...groups.entries()].map(([prefix, { parent, children }]) => {
          if (children.length === 0) return null;

          // 表示用タグ: 親タグがあればそれ、なければ先頭子タグの色を使用
          const displayTag = parent ?? children[0];
          if (!displayTag) return null;

          return (
            <div key={prefix} className="mb-1">
              {/* Group parent — 常にクリック可能 */}
              <TagRadioItem
                tag={displayTag}
                label={prefix}
                isSelected={parent ? selectedId === parent.id : false}
                onSelect={() => {
                  if (parent) {
                    handleSelect(parent.id, parent.name);
                  } else {
                    // 子タグの色を引き継いで親タグを作成
                    onCreateAndSelect(prefix, displayTag.color);
                  }
                }}
                onHover={handleHover}
                onHoverEnd={handleHoverEnd}
              />

              {/* Children */}
              {children.map((tag) => {
                const { suffix } = parseColonTag(tag.name);
                return (
                  <TagRadioItem
                    key={tag.id}
                    tag={tag}
                    label={suffix ?? tag.name}
                    isSelected={selectedId === tag.id}
                    onSelect={() => {
                      setSelectedId(tag.id);
                      handleSelect(tag.id, tag.name);
                    }}
                    onHover={handleHover}
                    onHoverEnd={handleHoverEnd}
                    indented
                  />
                );
              })}
            </div>
          );
        })}

        {/* Ungrouped tags */}
        {ungrouped.map((tag) => (
          <TagRadioItem
            key={tag.id}
            tag={tag}
            label={tag.name}
            isSelected={selectedId === tag.id}
            onSelect={() => {
              setSelectedId(tag.id);
              handleSelect(tag.id, tag.name);
            }}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
          />
        ))}
      </div>

      {/* Create new tag */}
      <div className="border-border flex items-center gap-2 border-t px-4 py-3">
        <Input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={handleCreateKeyDown}
          placeholder={t('tagSelector.createPlaceholder')}
          className="flex-1"
        />
        <Button
          icon
          variant="outline"
          onClick={handleCreateSubmit}
          disabled={!newTagName.trim()}
          className="shrink-0"
          aria-label={t('tagSelector.createPlaceholder')}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </>
  );
}

/** アンカー要素の横にパネルを配置する位置を計算 */
function calcAnchoredPosition(anchorRect: DOMRect, panelWidth: number) {
  const GAP = 8;
  const MARGIN = 16;
  const spaceRight = window.innerWidth - anchorRect.right - GAP - MARGIN;
  const spaceLeft = anchorRect.left - GAP - MARGIN;

  // 右に十分なスペースがあれば右、なければ左
  const left =
    spaceRight >= panelWidth
      ? anchorRect.right + GAP
      : spaceLeft >= panelWidth
        ? anchorRect.left - GAP - panelWidth
        : // どちらも足りなければ右寄せ（画面端からマージン）
          window.innerWidth - panelWidth - MARGIN;

  // 縦位置: アンカーの上端に揃えつつ、画面内に収まるようクランプ
  const maxTop = window.innerHeight - MARGIN;
  const top = Math.max(MARGIN, Math.min(anchorRect.top, maxTop - 200));

  return { top, left };
}

/** タグ選択フローティングパネル。モバイルはDrawer、PCはアンカー横フローティング */
export function TagQuickSelector({
  open,
  onOpenChange,
  onSelect,
  onCreateAndSelect,
  onTagHover,
  anchorRef,
}: TagQuickSelectorProps) {
  const t = useTranslations('calendar');
  const isMobile = useIsMobile();
  const mounted = useHasMounted();
  const panelRef = useRef<HTMLDivElement>(null);

  // PC: アンカー横に配置する位置を計算
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || isMobile) return;

    const anchor = anchorRef?.current;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const panelWidth = 384; // max-w-sm = 24rem = 384px
      setPosition(calcAnchoredPosition(rect, panelWidth));
    };

    update();

    // スクロール・リサイズで再計算
    window.addEventListener('resize', update);
    // カレンダーのスクロールコンテナにも対応
    const scrollParent = anchor.closest('[data-scroll-container]') ?? window;
    scrollParent.addEventListener('scroll', update, { passive: true });

    return () => {
      window.removeEventListener('resize', update);
      scrollParent.removeEventListener('scroll', update);
    };
  }, [open, isMobile, anchorRef]);

  // Escape キーで閉じる（PC のみ — Drawer は自前で処理）
  useEffect(() => {
    if (!open || isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, isMobile, onOpenChange]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    },
    [onOpenChange],
  );

  if (!mounted) return null;

  // モバイル: Vaul Drawer（スワイプで閉じる）
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>{t('tagSelector.title')}</DrawerTitle>
          </DrawerHeader>
          <TagQuickSelectorContent
            onSelect={onSelect}
            onCreateAndSelect={onCreateAndSelect}
            onTagHover={onTagHover}
          />
        </DrawerContent>
      </Drawer>
    );
  }

  // PC: フローティングパネル
  if (!open) return null;

  const panel = (
    <div className="z-overlay-popover fixed inset-0" onClick={handleBackdropClick}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={t('tagSelector.title')}
        className={cn(
          'bg-card border-border surface-raised-heavy absolute flex max-h-[70vh] w-full max-w-sm flex-col rounded-2xl border',
          'animate-in fade-in duration-150',
        )}
        style={position ? { top: position.top, left: position.left } : undefined}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{t('tagSelector.title')}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              'text-foreground flex size-8 items-center justify-center rounded-lg transition-colors',
              'hover:bg-state-hover',
            )}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <TagQuickSelectorContent
          onSelect={onSelect}
          onCreateAndSelect={onCreateAndSelect}
          onTagHover={onTagHover}
        />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
