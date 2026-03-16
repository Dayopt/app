'use client';

/**
 * タグマージモーダル
 *
 * TagQuickSelector と同じデザインパターン。
 * モバイル: Vaul Drawer（スワイプで閉じる）、PC: 中央フローティング。
 * コロン記法グルーピング対応。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionFooter } from '@/components/ui/action-footer';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useIsMobile } from '@/hooks/useIsMobile';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { parseColonTag } from '../lib/tag-colon';
import { TagRadioItem } from './TagRadioItem';

import { useMergeTag, useTags } from '../hooks';

import type { Tag } from '../types';

interface TagMergeModalProps {
  open: boolean;
  onClose: () => void;
  sourceTag: { id: string; name: string; color?: string | null };
  /** マージ成功時のコールバック */
  onMergeSuccess?: () => void;
}

export function TagMergeModal({ open, onClose, sourceTag, onMergeSuccess }: TagMergeModalProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const mounted = useHasMounted();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: tags, refetch: refetchTags } = useTags();
  const mergeTagMutation = useMergeTag();

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  // モーダルが開いたらリセット（React推奨: レンダー中のstate調整）
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(open);
    setSelectedTargetId('');
    setSearchQuery('');
    setError('');
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

  // 検索フィルタリング
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return mergeTargetTags;
    const q = searchQuery.toLowerCase();
    return mergeTargetTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [mergeTargetTags, searchQuery]);

  // コロン記法でグルーピング
  const { groups, ungrouped } = useMemo(() => {
    const prefixMap = new Map<string, Tag[]>();
    const noColon: Tag[] = [];

    for (const tag of filteredTags) {
      const { prefix, suffix } = parseColonTag(tag.name);
      if (suffix !== null) {
        const existing = prefixMap.get(prefix) ?? [];
        existing.push(tag);
        prefixMap.set(prefix, existing);
      } else {
        noColon.push(tag);
      }
    }

    return { groups: prefixMap, ungrouped: noColon };
  }, [filteredTags]);

  // 選択されたタグを取得（確認メッセージ用）
  const selectedTarget = mergeTargetTags.find((tag) => tag.id === selectedTargetId);

  const handleSelectTag = useCallback((tagId: string) => {
    setSelectedTargetId(tagId);
    setError('');
  }, []);

  // グループ親選択: 先頭子タグのIDを使用
  const handleSelectGroupParent = useCallback((firstTagId: string) => {
    setSelectedTargetId(firstTagId);
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

  const hasResults = filteredTags.length > 0;
  const descriptionText = selectedTarget
    ? confirmationMessage
    : t('calendar.filter.mergeTag.selectTarget');

  const mergeContent = (
    <>
      {/* Search */}
      <div className="border-border border-b px-4 py-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('calendar.filter.mergeTag.searchPlaceholder')}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tag list */}
      <div
        className="overflow-y-auto px-1 py-2"
        style={{ maxHeight: '50vh' }}
        role="radiogroup"
        aria-label={t('calendar.filter.mergeTag.title')}
      >
        {!hasResults && (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            {t('calendar.filter.mergeTag.noResults')}
          </p>
        )}

        {/* Grouped tags */}
        {[...groups.entries()].map(([prefix, groupTags]) => {
          const firstTag = groupTags[0];
          if (!firstTag) return null;

          return (
            <div key={prefix} className="mb-1">
              <TagRadioItem
                tag={firstTag}
                label={prefix}
                isSelected={selectedTargetId === firstTag.id}
                onSelect={() => handleSelectGroupParent(firstTag.id)}
              />
              {groupTags.map((tag) => {
                const { suffix } = parseColonTag(tag.name);
                return (
                  <TagRadioItem
                    key={tag.id}
                    tag={tag}
                    label={suffix ?? tag.name}
                    isSelected={selectedTargetId === tag.id}
                    onSelect={() => handleSelectTag(tag.id)}
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
            isSelected={selectedTargetId === tag.id}
            onSelect={() => handleSelectTag(tag.id)}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-destructive px-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Footer */}
      <ActionFooter className="border-border border-t px-4 py-3">
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

  // モバイル: Vaul Drawer（スワイプで閉じる）
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && !mergeTagMutation.isPending && onClose()}>
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
        aria-modal="false"
        aria-label={t('calendar.filter.mergeTag.title')}
        className={cn(
          'bg-card border-border absolute flex flex-col border shadow-xl',
          'animate-in fade-in duration-150',
          'top-1/2 left-1/2 max-h-[70vh] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl',
        )}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t('calendar.filter.mergeTag.title')}</h2>
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
