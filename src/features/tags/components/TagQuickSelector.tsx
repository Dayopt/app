'use client';

/**
 * TagQuickSelector
 *
 * タグ選択用フローティングパネル。
 * ラジオボタン型の単一選択 + 新規作成。
 * overlayなし — 背景コンテンツが見える状態を維持。
 * モバイル: Vaul Drawer（スワイプで閉じる）、PC: アンカー横フローティング。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Check, ChevronLeft, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/lib/components/ui/action-footer';
import { Button } from '@/lib/components/ui/button';
import { getColorDisplayName } from '@/lib/components/ui/color-palette-picker';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/lib/components/ui/drawer';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { TAG_COLOR_NAMES, getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';
import { useTags } from '../hooks/useTagsQuery';
import { DEFAULT_TAG_ICON } from '../lib/curated-icons';
import { parseColonTag } from '../lib/tag-colon';
import { IconPicker } from './IconPicker';
import { TagBadgeList } from './TagBadgeList';
import { TagIcon } from './TagIcon';

import type { TagColorName } from '@/lib/tag-colors';

import type { Tag } from '../types';

/** タグが0件のときにユーザーへ表示するサンプルタグ候補一覧 */
const SAMPLE_TAG_CHIPS: Array<{ nameKey: string; color: TagColorName; icon: string }> = [
  { nameKey: 'work', color: 'blue', icon: 'briefcase' },
  { nameKey: 'study', color: 'indigo', icon: 'book-open' },
  { nameKey: 'exercise', color: 'green', icon: 'dumbbell' },
  { nameKey: 'break', color: 'amber', icon: 'coffee' },
  { nameKey: 'meal', color: 'orange', icon: 'utensils' },
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
  onCreateAndSelect: (name: string, color?: string | null, icon?: string | null) => void;
  /** タグホバー時のコールバック（プレビュー用） */
  onTagHover?: ((tag: HoveredTagInfo | null) => void) | undefined;
  /** PC: アンカー要素の横にパネルを配置する */
  anchorRef?: React.RefObject<HTMLDivElement | HTMLButtonElement | null>;
  /** ヘッダーに表示する日付・時間帯ラベル（例: "3/30 (日) 14:00 – 15:30"） */
  timeLabel?: string | undefined;
}

// ─────────────────────────────────────────────────────────
// Create Tag Form (2ページ目)
// ─────────────────────────────────────────────────────────

function CreateTagFormView({
  parentTags,
  onBack,
  onCreateAndSelect,
}: {
  parentTags: Tag[];
  onBack: () => void;
  onCreateAndSelect: (name: string, color?: string | null, icon?: string | null) => void;
}) {
  const t = useTranslations('calendar');
  const tCommon = useTranslations('common');
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState<TagColorName>('blue');
  const [selectedIcon, setSelectedIcon] = useState<string | null>(DEFAULT_TAG_ICON);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const fullName = selectedGroup ? `${selectedGroup}:${name.trim()}` : name.trim();
    onCreateAndSelect(fullName, selectedColor, selectedIcon);
  }, [canSubmit, selectedGroup, name, selectedColor, selectedIcon, onCreateAndSelect]);

  // グループ選択で色を自動継承
  const effectiveColor = useMemo(() => {
    if (!selectedGroup) return selectedColor;
    const group = parentTags.find((t) => t.name === selectedGroup);
    return (group?.color as TagColorName) ?? selectedColor;
  }, [selectedGroup, parentTags, selectedColor]);

  return (
    <div className="flex flex-col overflow-y-auto" style={{ maxHeight: '60vh' }}>
      {/* ← 戻るヘッダー */}
      <button type="button" onClick={onBack} className="group flex min-h-11 items-center px-4 py-2">
        <span className="group-hover:bg-state-hover flex items-center gap-2 rounded-lg px-2 py-1 transition-colors">
          <ChevronLeft className="text-muted-foreground size-5" />
          <span className="text-foreground font-medium">{t('tagSelector.new')}</span>
        </span>
      </button>

      <div className="flex flex-col gap-4 px-4 py-2">
        {/* 名前 */}
        <div className="flex flex-col gap-1">
          <label htmlFor="create-tag-name" className="text-muted-foreground text-sm">
            {t('tagSelector.createPlaceholder')}
          </label>
          <input
            id="create-tag-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="border-border bg-container focus:ring-primary min-h-11 w-full rounded-lg border px-4 text-sm outline-none focus:ring-2"
            autoFocus
          />
        </div>

        {/* 色 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">{t('tagSelector.color')}</span>
          <div className="grid grid-cols-5 gap-2">
            {TAG_COLOR_NAMES.map((color) => {
              const classes = getTagColorClasses(color);
              const isActive = effectiveColor === color;
              const displayName = getColorDisplayName(color, tCommon);
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className="flex flex-col items-center gap-1"
                  aria-label={displayName}
                  aria-pressed={isActive}
                >
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full transition-all',
                      isActive ? 'ring-primary ring-2 ring-offset-2' : 'hover:scale-110',
                      classes.dot,
                    )}
                  >
                    {isActive && <Check className="size-4 text-white" />}
                  </span>
                  <span className="text-muted-foreground text-xs">{displayName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* アイコン */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm">{t('tagSelector.icon')}</span>
          <IconPicker value={selectedIcon} onChange={setSelectedIcon} />
        </div>

        {/* グループ（任意） */}
        {parentTags.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-sm">{t('tagSelector.group')}</span>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className={cn(
                  'rounded-full border px-2 py-1 text-sm transition-colors',
                  !selectedGroup
                    ? 'border-primary bg-primary-state-selected text-foreground'
                    : 'border-border hover:bg-state-hover text-muted-foreground',
                )}
              >
                {t('tagSelector.noGroup')}
              </button>
              {parentTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedGroup(tag.name)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-colors',
                    selectedGroup === tag.name
                      ? 'border-primary bg-primary-state-selected text-foreground'
                      : 'border-border hover:bg-state-hover text-muted-foreground',
                  )}
                >
                  <TagIcon icon={tag.icon} color={tag.color} size="sm" />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* フッター */}
        <ActionFooter>
          <Button variant="outline" onClick={onBack}>
            {tCommon('actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {tCommon('actions.create')}
          </Button>
        </ActionFooter>
      </div>
    </div>
  );
}

/**
 * タグ選択コンテンツ
 *
 * 通常はタグ一覧（TagBadgeList）を表示。新規作成押下で CreateTagFormView に遷移。
 */
function TagQuickSelectorContent({
  onSelect,
  onCreateAndSelect,
  onTagHover,
}: {
  onSelect: (tagId: string, tagName: string) => void;
  onCreateAndSelect: (name: string, color?: string | null, icon?: string | null) => void;
  onTagHover?: ((tag: HoveredTagInfo | null) => void) | undefined;
}) {
  const t = useTranslations('calendar');
  const { data: tags } = useTags();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // アクティブなタグのみ、ソート済み
  const sortedTags = useMemo(() => {
    const active = (tags ?? []).filter((tag) => tag.is_active !== false);
    return [...active].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [tags]);

  // 作成フォームでグループ選択に使う親タグ（コロン記法の prefix を持たないフラットタグ）
  const parentTags = useMemo(
    () => sortedTags.filter((tag) => parseColonTag(tag.name).suffix === null),
    [sortedTags],
  );

  const handleSelect = useCallback(
    (tagId: string, tagName: string) => {
      setSelectedId(tagId);
      onSelect(tagId, tagName);
    },
    [onSelect],
  );

  const isTagZero = sortedTags.length === 0;

  // 作成フォーム画面
  if (isCreating) {
    return (
      <CreateTagFormView
        parentTags={parentTags}
        onBack={() => setIsCreating(false)}
        onCreateAndSelect={(name, color, icon) => {
          onCreateAndSelect(name, color, icon);
          setIsCreating(false);
        }}
      />
    );
  }

  // タグゼロ時: サンプルタグ候補チップ
  if (isTagZero) {
    return (
      <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
        <div className="space-y-2 px-4 py-4">
          <div className="text-center">
            <p className="text-foreground text-sm">{t('tagSelector.emptyTitle')}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('tagSelector.emptyDescription')}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {SAMPLE_TAG_CHIPS.map(({ nameKey, color, icon }) => {
              const name = t(`tagSelector.sampleTags.${nameKey}`);
              return (
                <button
                  key={nameKey}
                  type="button"
                  onClick={() => onCreateAndSelect(name, color, icon)}
                  className="border-border hover:bg-state-hover flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-colors"
                >
                  <TagIcon icon={icon} color={color} size="sm" />
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // メイン: タグ badge 一覧
  return (
    <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
      <TagBadgeList
        tags={sortedTags}
        selectedId={selectedId}
        onSelect={handleSelect}
        onCreate={() => setIsCreating(true)}
        onTagHover={onTagHover}
      />
    </div>
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
  timeLabel,
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

  // PC: 背景コンテンツを inert にしてポインタイベントのリークを防止
  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || isMobile) return;

    const backdrop = backdropRef.current;
    if (!backdrop) return;

    const inerted: Element[] = [];
    for (const child of document.body.children) {
      if (child === backdrop || child === backdrop.parentElement) continue;
      if (!child.hasAttribute('inert')) {
        child.setAttribute('inert', '');
        inerted.push(child);
      }
    }

    return () => {
      for (const el of inerted) {
        el.removeAttribute('inert');
      }
    };
  }, [open, isMobile]);

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
        {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit */}
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>{t('tagSelector.title')}</DrawerTitle>
            {timeLabel && <p className="text-muted-foreground text-sm">{timeLabel}</p>}
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
    <div
      ref={backdropRef}
      className="z-overlay-popover fixed inset-0"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={t('tagSelector.title')}
        className={cn(
          'bg-card border-border-subtle shadow-card absolute flex max-h-[70vh] w-full max-w-sm flex-col rounded-2xl border',
          'animate-in fade-in duration-150',
        )}
        style={position ? { top: position.top, left: position.left } : undefined}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">{t('tagSelector.title')}</h2>
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
          {timeLabel && <p className="text-muted-foreground text-sm">{timeLabel}</p>}
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
