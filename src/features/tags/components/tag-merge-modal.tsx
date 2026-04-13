'use client';

/**
 * タグマージモーダル
 *
 * TagGridSelector と同じデザインパターン。
 * 親タグはドリルダウンで子タグを表示。
 * モバイル: Vaul Drawer（スワイプで閉じる）、PC: 中央フローティング。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Check, ChevronLeft, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/lib/components/ui/action-footer';
import { Button } from '@/lib/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/lib/components/ui/drawer';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { logger } from '@/lib/logger';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';
import { parseColonTag } from '../lib/tag-colon';
import { TagIcon } from './TagIcon';

import { useMergeTag, useTags } from '../hooks';
import type { Tag } from '../types';

interface TagMergeModalProps {
  open: boolean;
  onClose: () => void;
  sourceTag: { id: string; name: string; color?: string | null };
  /** マージ成功時のコールバック */
  onMergeSuccess?: () => void;
}

type MergeView = { type: 'grid' } | { type: 'drill'; prefix: string };

export function TagMergeModal({ open, onClose, sourceTag, onMergeSuccess }: TagMergeModalProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const mounted = useHasMounted();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: tags, refetch: refetchTags } = useTags();
  const mergeTagMutation = useMergeTag();

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [error, setError] = useState('');
  const [view, setView] = useState<MergeView>({ type: 'grid' });

  // フォーカストラップ・初期フォーカス・フォーカス復元（PC のみ、モバイルは Drawer が処理）
  useFocusTrap(panelRef, open && !isMobile);

  // モーダルが開いたらリセット
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(open);
    setSelectedTargetId('');
    setError('');
    setView({ type: 'grid' });
  } else if (open !== prevOpen) {
    setPrevOpen(open);
  }

  // 最新のタグリストを取得
  useEffect(() => {
    if (open) {
      void refetchTags();
    }
  }, [open, refetchTags]);

  // ESCキーでダイアログを閉じる
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mergeTagMutation.isPending) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, mergeTagMutation.isPending, onClose]);

  // マージ対象のタグ一覧（自分を除外、アクティブなもののみ、ソート済み）
  const mergeTargetTags = useMemo(() => {
    const active = (tags ?? []).filter((tag) => tag.id !== sourceTag.id && tag.is_active !== false);
    return [...active].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [tags, sourceTag.id]);

  // グルーピング: コロン記法で親子に分割
  const { topLevelTags, childrenByPrefix } = useMemo(() => {
    const childMap = new Map<string, Tag[]>();
    const flatTags: Tag[] = [];

    for (const tag of mergeTargetTags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        const existing = childMap.get(prefix) ?? [];
        existing.push(tag);
        childMap.set(prefix, existing);
      } else {
        flatTags.push(tag);
      }
    }

    return { topLevelTags: flatTags, childrenByPrefix: childMap };
  }, [mergeTargetTags]);

  // 選択されたタグを取得（確認メッセージ用）
  const selectedTarget = mergeTargetTags.find((tag) => tag.id === selectedTargetId);

  const handleSelectTag = useCallback((tagId: string) => {
    setSelectedTargetId(tagId);
    setError('');
  }, []);

  const handleMerge = useCallback(async () => {
    if (!selectedTargetId) {
      setError(t('calendar.filter.mergeTag.selectRequired'));
      return;
    }

    try {
      await mergeTagMutation.mutateAsync({
        sourceTagId: sourceTag.id,
        targetTagId: selectedTargetId,
      });

      onMergeSuccess?.();
      setSelectedTargetId('');
      onClose();
    } catch (err) {
      logger.error('Merge failed:', err);
      setError(t('tags.merge.failed'));
    }
  }, [selectedTargetId, sourceTag.id, mergeTagMutation, onMergeSuccess, onClose, t]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (!mergeTagMutation.isPending) {
        onClose();
      }
    },
    [mergeTagMutation.isPending, onClose],
  );

  // 確認メッセージ（選択後に表示）
  const confirmationMessage = selectedTarget
    ? t('calendar.filter.mergeTag.description', {
        sourceName: sourceTag.name,
        targetName: selectedTarget.name,
      })
    : null;

  if (!mounted) return null;

  const descriptionText = selectedTarget
    ? confirmationMessage
    : t('calendar.filter.mergeTag.selectTarget');

  // ドリルダウン画面の中身
  const renderDrillContent = (prefix: string) => {
    const children = childrenByPrefix.get(prefix) ?? [];
    const parentTag = topLevelTags.find((t) => t.name === prefix);

    return (
      <div className="flex flex-col">
        {/* ← 戻るヘッダー */}
        <button
          type="button"
          onClick={() => setView({ type: 'grid' })}
          className="hover:bg-state-hover flex min-h-11 items-center gap-2 px-4 py-2 transition-colors"
        >
          <ChevronLeft className="text-muted-foreground size-5" />
          {parentTag && <TagIcon icon={parentTag.icon} color={parentTag.color} size="sm" />}
          <span className="text-foreground font-medium">{prefix}</span>
        </button>

        {/* 親タグ自体 + 子タググリッド */}
        <div className="grid grid-cols-4 gap-2 px-4 py-2">
          {parentTag && (
            <TagGridCell
              tag={parentTag}
              isSelected={selectedTargetId === parentTag.id}
              onSelect={() => handleSelectTag(parentTag.id)}
            />
          )}
          {children.map((child) => {
            const { suffix } = parseColonTag(child.name);
            return (
              <TagGridCell
                key={child.id}
                tag={child}
                displayName={suffix ?? child.name}
                isSelected={selectedTargetId === child.id}
                onSelect={() => handleSelectTag(child.id)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  // メイングリッド画面の中身
  const renderGridContent = () => {
    const hasResults = topLevelTags.length > 0;

    return (
      <div
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit
        className="max-h-[50vh] overflow-y-auto px-4 py-2"
        role="radiogroup"
        aria-label={t('calendar.filter.mergeTag.title')}
      >
        {!hasResults && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t('calendar.filter.mergeTag.noResults')}
          </p>
        )}

        {hasResults && (
          <div className="grid grid-cols-4 gap-2">
            {topLevelTags.map((tag) => {
              const hasChildren = childrenByPrefix.has(tag.name);
              return (
                <TagGridCell
                  key={tag.id}
                  tag={tag}
                  isSelected={selectedTargetId === tag.id}
                  hasChildren={hasChildren}
                  onSelect={() => {
                    if (hasChildren) {
                      setView({ type: 'drill', prefix: tag.name });
                    } else {
                      handleSelectTag(tag.id);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const mergeContent = (
    <>
      {view.type === 'drill' ? renderDrillContent(view.prefix) : renderGridContent()}

      {/* Error */}
      {error && (
        <p className="text-destructive px-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Footer */}
      <ActionFooter className="border-border border-t px-4 py-2">
        <Button variant="outline" onClick={onClose} disabled={mergeTagMutation.isPending}>
          {t('common.actions.cancel')}
        </Button>
        <Button
          variant="destructive"
          onClick={handleMerge}
          disabled={!selectedTargetId || mergeTagMutation.isPending}
        >
          {mergeTagMutation.isPending
            ? t('calendar.toast.saving')
            : t('calendar.filter.mergeTag.confirm')}
        </Button>
      </ActionFooter>
    </>
  );

  // モバイル: Vaul Drawer
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && !mergeTagMutation.isPending && onClose()}>
        {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit */}
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>{t('calendar.filter.mergeTag.title')}</DrawerTitle>
            <p className="text-muted-foreground mt-1 text-sm">{descriptionText}</p>
          </DrawerHeader>
          {mergeContent}
        </DrawerContent>
      </Drawer>
    );
  }

  // PC: 中央フローティング
  if (!open) return null;

  const panel = (
    <div className="fixed inset-0 z-50" onClick={handleBackdropClick}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('calendar.filter.mergeTag.title')}
        className={cn(
          'bg-card border-border-subtle shadow-card absolute flex flex-col border',
          'animate-in fade-in duration-150',
          'top-1/2 left-1/2 max-h-[70vh] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl',
        )}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">{t('calendar.filter.mergeTag.title')}</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={mergeTagMutation.isPending}
              className={cn(
                'text-foreground flex size-8 items-center justify-center rounded-lg transition-colors',
                'hover:bg-state-hover',
              )}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{descriptionText}</p>
        </div>

        {mergeContent}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

// ─────────────────────────────────────────────────────────
// Grid Tag Cell（GridSelectorパターン準拠）
// ─────────────────────────────────────────────────────────

interface TagGridCellProps {
  tag: { name: string; color: string | null; icon: string | null };
  displayName?: string;
  isSelected?: boolean;
  hasChildren?: boolean;
  onSelect: () => void;
}

function TagGridCell({
  tag,
  displayName,
  isSelected = false,
  hasChildren = false,
  onSelect,
}: TagGridCellProps) {
  const colorClasses = getTagColorClasses(tag.color);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl p-2 transition-colors',
        'active:scale-95 active:transition-transform',
        isSelected ? 'ring-primary ring-2' : 'hover:bg-state-hover',
        colorClasses.tint,
      )}
      role="radio"
      aria-checked={isSelected}
    >
      <div className="relative flex size-8 items-center justify-center">
        <TagIcon icon={tag.icon} color={tag.color} size="lg" />
        {isSelected && <Check className="absolute inset-0 m-auto size-4 text-white" />}
      </div>
      <span className="text-foreground flex w-full items-center justify-center gap-1 text-sm">
        <span className="truncate">{displayName ?? tag.name}</span>
        {hasChildren && <span className="text-muted-foreground shrink-0 text-xs">›</span>}
      </span>
    </button>
  );
}
