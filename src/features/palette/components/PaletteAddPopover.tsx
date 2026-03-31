'use client';

/**
 * PaletteAddPopover — タグ + duration を選んでパレットにピン追加
 *
 * TagQuickSelector と同じ位置決めパターン:
 * - PC: calcAnchoredPosition + createPortal（アンカー横フローティング）
 * - モバイル: Vaul Drawer（スワイプで閉じる）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { TagGridPicker, useTags } from '@/features/tags';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

import { DURATION_PRESETS } from '../constants';
import { usePaletteMutations } from '../hooks/usePaletteMutations';
import type { PaletteItem } from '../hooks/usePaletteQuery';

interface PaletteAddPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PC: アンカー要素の横にパネルを配置する */
  anchorRef?: React.RefObject<HTMLButtonElement | HTMLDivElement | null>;
  pinnedItems?: PaletteItem[] | undefined;
}

/** アンカー要素の横にパネルを配置する位置を計算 */
function calcAnchoredPosition(anchorRect: DOMRect, panelWidth: number) {
  const GAP = 8;
  const MARGIN = 16;
  const spaceRight = window.innerWidth - anchorRect.right - GAP - MARGIN;
  const spaceLeft = anchorRect.left - GAP - MARGIN;

  const left =
    spaceRight >= panelWidth
      ? anchorRect.right + GAP
      : spaceLeft >= panelWidth
        ? anchorRect.left - GAP - panelWidth
        : window.innerWidth - panelWidth - MARGIN;

  const maxTop = window.innerHeight - MARGIN;
  const top = Math.max(MARGIN, Math.min(anchorRect.top, maxTop - 200));

  return { top, left };
}

/**
 * フォームコンテンツ（PC / モバイル共通）
 */
function PaletteAddContent({
  pinnedItems,
  onClose,
}: {
  pinnedItems?: PaletteItem[] | undefined;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { data: tags } = useTags();
  const { pinItem, isPinning } = usePaletteMutations();

  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<string>('');

  const activeTags = useMemo(
    () =>
      (tags ?? [])
        .filter((tag) => tag.is_active)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [tags],
  );

  const pinnedSet = useMemo(
    () => new Set((pinnedItems ?? []).map((p) => `${p.tag_id}:${p.duration_minutes}`)),
    [pinnedItems],
  );

  const isDuplicate =
    selectedTagId !== '' &&
    selectedDuration !== '' &&
    pinnedSet.has(`${selectedTagId}:${Number(selectedDuration)}`);

  const canSubmit = selectedTagId !== '' && selectedDuration !== '' && !isDuplicate;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || isPinning) return;
    pinItem(selectedTagId, Number(selectedDuration), {
      onSuccess: () => {
        setSelectedTagId('');
        setSelectedDuration('');
        onClose();
      },
    });
  }, [canSubmit, isPinning, pinItem, selectedTagId, selectedDuration, onClose]);

  const handleClose = useCallback(() => {
    setSelectedTagId('');
    setSelectedDuration('');
    onClose();
  }, [onClose]);

  return (
    <div className="px-4 pt-2 pb-4">
      <FieldGroup className="mb-6">
        {/* タグ選択（グリッド） */}
        <Field>
          <FieldLabel>{t('sidebar.palette.tagLabel')}</FieldLabel>
          <TagGridPicker
            tags={activeTags}
            selectedId={selectedTagId}
            onSelect={(id) => setSelectedTagId(id)}
          />
        </Field>

        {/* Duration 選択（チップ） */}
        <Field>
          <FieldLabel>{t('sidebar.palette.durationLabel')}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setSelectedDuration(String(preset.value))}
                className={cn(
                  'rounded-full border px-4 py-1 text-sm font-medium transition-colors',
                  selectedDuration === String(preset.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-state-hover text-foreground',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 重複エラー */}
        {isDuplicate && <FieldError noPrefix>{t('sidebar.palette.duplicateError')}</FieldError>}
      </FieldGroup>

      <ActionFooter>
        <Button variant="outline" onClick={handleClose} aria-disabled={isPinning}>
          {t('common.actions.cancel')}
        </Button>
        <Button aria-disabled={!canSubmit} isLoading={isPinning} onClick={handleSubmit}>
          {t('sidebar.palette.add')}
        </Button>
      </ActionFooter>
    </div>
  );
}

/** パレットにピン追加するフローティングパネル（モバイル: Drawer / PC: アンカー横ポータル） */
export function PaletteAddPopover({
  open,
  onOpenChange,
  anchorRef,
  pinnedItems,
}: PaletteAddPopoverProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const mounted = useHasMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const panelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
  }, []);

  // PC: アンカー横に配置する位置を計算
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || isMobile) return;

    const anchor = anchorRef?.current;
    if (!anchor) return;

    const panelWidth = 320; // w-80 = 20rem = 320px

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setPosition(calcAnchoredPosition(rect, panelWidth));
    };

    update();

    window.addEventListener('resize', update);
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

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // フォーカスをアンカー要素に返却
    requestAnimationFrame(() => {
      anchorRef?.current?.focus();
    });
  }, [onOpenChange, anchorRef]);

  if (!mounted) return null;

  // モバイル: Vaul Drawer
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>{t('sidebar.palette.add')}</DrawerTitle>
          </DrawerHeader>
          <PaletteAddContent pinnedItems={pinnedItems} onClose={handleClose} />
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
        ref={panelCallbackRef}
        role="dialog"
        aria-modal="false"
        aria-label={t('sidebar.palette.add')}
        className={cn(
          'bg-card border-border-subtle shadow-card absolute flex w-80 flex-col rounded-2xl border',
          'animate-in fade-in duration-150',
        )}
        style={position ? { top: position.top, left: position.left } : undefined}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{t('sidebar.palette.add')}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              'text-foreground flex size-8 items-center justify-center rounded-lg transition-colors',
              'hover:bg-state-hover',
            )}
            aria-label={t('common.actions.close')}
          >
            <X className="size-4" />
          </button>
        </div>

        <PaletteAddContent pinnedItems={pinnedItems} onClose={handleClose} />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
