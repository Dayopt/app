'use client';

/**
 * TagQuickSelector
 *
 * タグ選択用フローティングパネル。
 * ラジオボタン型の単一選択 + 新規作成（グローバル TagCreateModal 経由）。
 * overlayなし — 背景コンテンツが見える状態を維持。
 * モバイル: Vaul Drawer（スワイプで閉じる）、PC: アンカー横フローティング。
 *
 * 「+」押下時は自身を一旦閉じてからグローバル TagCreateModal を開く（vaul nested
 * Drawer 問題を避けるため）。modal の onCreated callback で selection を反映する。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/lib/components/ui/drawer';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useShellStore } from '@/lib/stores/useShellStore';
import { cn } from '@/lib/utils';
import { useTags } from '../hooks/useTagsQuery';
import { TagBadgeList } from './TagBadgeList';
import { TagIcon } from './TagIcon';

/** タグが0件のときにユーザーへ表示するサンプルタグ候補一覧 */
const SAMPLE_TAG_CHIPS: Array<{ nameKey: string; color: string; icon: string }> = [
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
  onCreateAndSelect: (
    name: string,
    color?: string | null,
    icon?: string | null,
    parentId?: string | null,
  ) => void;
  /** タグホバー時のコールバック（プレビュー用） */
  onTagHover?: ((tag: HoveredTagInfo | null) => void) | undefined;
  /** PC: アンカー要素の横にパネルを配置する */
  anchorRef?: React.RefObject<HTMLDivElement | HTMLButtonElement | null>;
  /** ヘッダーに表示する日付・時間帯ラベル（例: "3/30 (日) 14:00 – 15:30"） */
  timeLabel?: string | undefined;
}

/**
 * タグ選択コンテンツ
 *
 * 通常はタグ一覧（TagBadgeList）を表示。末尾の「+」押下で自身を閉じ、
 * グローバル TagCreateModal を `openTagCreateModal({ onCreated })` で開く。
 */
function TagQuickSelectorContent({
  onSelect,
  onCreateAndSelect,
  onTagHover,
  closeSelf,
}: {
  onSelect: (tagId: string, tagName: string) => void;
  onCreateAndSelect: (
    name: string,
    color?: string | null,
    icon?: string | null,
    parentId?: string | null,
  ) => void;
  onTagHover?: ((tag: HoveredTagInfo | null) => void) | undefined;
  /** 自身（TagQuickSelector）を閉じる関数。modal を開く前に呼んで nest を回避 */
  closeSelf: () => void;
}) {
  const t = useTranslations('calendar');
  const { data: tags } = useTags();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openTagCreateModal = useShellStore.use.openTagCreateModal();

  const sortedTags = useMemo(() => (tags ?? []).filter((tag) => tag.is_active !== false), [tags]);

  const handleSelect = useCallback(
    (tagId: string, tagName: string) => {
      setSelectedId(tagId);
      onSelect(tagId, tagName);
    },
    [onSelect],
  );

  const handleOpenCreate = useCallback(() => {
    closeSelf();
    openTagCreateModal({
      onCreated: (tag) => {
        onCreateAndSelect(tag.name, tag.color, tag.icon, tag.parent_id);
      },
    });
  }, [closeSelf, openTagCreateModal, onCreateAndSelect]);

  const isTagZero = sortedTags.length === 0;

  // タグゼロ時: サンプルタグ候補チップ + 新規作成導線
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
        <TagBadgeList
          tags={sortedTags}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreate={handleOpenCreate}
          onTagHover={onTagHover}
        />
      </div>
    );
  }

  // メイン: タグ badge 一覧 + 「+」で global modal を開く
  return (
    <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
      <TagBadgeList
        tags={sortedTags}
        selectedId={selectedId}
        onSelect={handleSelect}
        onCreate={handleOpenCreate}
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

  const closeSelf = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

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
            closeSelf={closeSelf}
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
          closeSelf={closeSelf}
        />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
