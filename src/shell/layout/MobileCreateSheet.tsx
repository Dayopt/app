'use client';

import { useCallback, useMemo, useState } from 'react';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { Button } from '@/components/ui/button';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { RecentBlocks } from '@/features/history';
import {
  DURATION_PRESETS,
  Palette,
  usePaletteItems,
  usePaletteMutations,
} from '@/features/palette';
import { TagIcon, useTags } from '@/features/tags';
import { cn } from '@/lib/utils';
import { useShellStore } from '@/shell/stores/useShellStore';

const SNAP_POINTS = [0.95] as const;

/** モバイル用作成ボトムシート — Palette + RecentBlocks + インライン追加フォーム（Composition Layer） */
export function MobileCreateSheet() {
  const t = useTranslations();
  const activeSheet = useShellStore((s) => s.activeSheet);
  const open = activeSheet?.type === 'mobileCreate';
  const openSheet = useShellStore((s) => s.openSheet);
  const closeSheet = useShellStore((s) => s.closeSheet);
  const setOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        openSheet({ type: 'mobileCreate' });
      } else {
        closeSheet();
      }
    },
    [openSheet, closeSheet],
  );
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const { pinItem } = usePaletteMutations();

  // ビュー切り替え: list（一覧） / add（パレット追加フォーム）
  const [view, setView] = useState<'list' | 'add'>('list');

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setSnap(SNAP_POINTS[0]);
      } else {
        // 閉じたときはリストに戻す
        setView('list');
      }
    },
    [setOpen],
  );

  // 履歴からのピン留め — 成功時にtoastで通知
  const handlePinFromHistory = useCallback(
    (tagId: string, durationMinutes: number) => {
      pinItem(tagId, durationMinutes, {
        onSuccess: () => toast.success(t('sidebar.recentBlocks.pinned')),
      });
    },
    [pinItem, t],
  );

  // ブロッククリック時のみシートを閉じる（data-block-action属性で判定）
  const handleBlockClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-block-action]')) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const handleAddClick = useCallback(() => {
    setView('add');
  }, []);

  const handleAddComplete = useCallback(() => {
    setView('list');
  }, []);

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      snapPoints={SNAP_POINTS as unknown as number[]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      fadeFromIndex={0}
    >
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- CSS unset override */}
      <DrawerContent className="max-h-[unset] rounded-t-2xl">
        <VisuallyHidden asChild>
          <DrawerTitle>Create</DrawerTitle>
        </VisuallyHidden>

        {view === 'list' ? (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-8"
            onClick={handleBlockClick}
            role="presentation"
          >
            <Palette onAddClick={handleAddClick} />
            <RecentBlocks onPinItem={handlePinFromHistory} />
          </div>
        ) : (
          <PaletteAddForm onBack={handleAddComplete} onComplete={handleAddComplete} />
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────
// インライン追加フォーム
// ─────────────────────────────────────────────────────────

interface PaletteAddFormProps {
  onBack: () => void;
  onComplete: () => void;
}

function PaletteAddForm({ onBack, onComplete }: PaletteAddFormProps) {
  const t = useTranslations();
  const { data: tags } = useTags();
  const { data: pinnedItems } = usePaletteItems();
  const { pinItem, isPinning } = usePaletteMutations();

  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const pinnedSet = useMemo(
    () => new Set((pinnedItems ?? []).map((p) => `${p.tag_id}:${p.duration_minutes}`)),
    [pinnedItems],
  );

  const isDuplicate =
    selectedTagId !== '' &&
    selectedDuration !== null &&
    pinnedSet.has(`${selectedTagId}:${selectedDuration}`);

  const canSubmit = selectedTagId !== '' && selectedDuration !== null && !isDuplicate;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || isPinning || selectedDuration === null) return;
    pinItem(selectedTagId, selectedDuration, {
      onSuccess: () => {
        onComplete();
      },
    });
  }, [canSubmit, isPinning, pinItem, selectedTagId, selectedDuration, onComplete]);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-8">
      {/* ヘッダー: ← パレットに追加 */}
      <div className="flex h-10 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-lg"
          aria-label={t('common.actions.back')}
        >
          <ArrowLeft className="size-5" />
        </button>
        <h2 className="text-base font-bold">{t('sidebar.palette.add')}</h2>
      </div>

      {/* タグ選択 — スクロール可能な一覧 */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <label className="text-muted-foreground mb-1 block shrink-0 text-sm">
          {t('sidebar.palette.tagLabel')}
        </label>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {(tags ?? [])
            .filter((tag) => tag.is_active)
            .map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSelectedTagId(tag.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-left text-base transition-colors',
                  selectedTagId === tag.id
                    ? 'bg-primary-state-selected text-foreground'
                    : 'text-foreground hover:bg-state-hover',
                )}
              >
                <TagIcon icon={tag.icon} color={tag.color} size="sm" className="shrink-0" />
                <ColonTagLabel name={tag.name} className="min-w-0" />
              </button>
            ))}
        </div>
      </div>

      {/* Duration チップ */}
      <div className="mt-4">
        <label className="text-muted-foreground mb-1 block text-sm">
          {t('sidebar.palette.durationLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setSelectedDuration(preset.value)}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                selectedDuration === preset.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-state-hover',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 重複エラー */}
      {isDuplicate && (
        <p className="text-destructive mt-2 text-sm">{t('sidebar.palette.duplicateError')}</p>
      )}

      {/* 追加ボタン */}
      <div className="mt-6">
        <Button
          className="w-full"
          aria-disabled={!canSubmit}
          isLoading={isPinning}
          onClick={handleSubmit}
        >
          {t('sidebar.palette.add')}
        </Button>
      </div>
    </div>
  );
}
