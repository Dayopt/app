'use client';

/**
 * タグマージモーダル
 *
 * TagGridSelector と同じ選択パターン。親タグはドリルダウンで子タグを表示。
 * 外枠（モバイル Drawer / PC AlertDialog 切替、フォーカストラップ、destructive フッター）は
 * DestructiveFormDialog に委譲する。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Check, ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DestructiveFormDialog } from '@/lib/components/ui/destructive-form-dialog';
import { logger } from '@/lib/logger';
import { getTagColorClasses } from '@/lib/tag-colors';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

import { useMergeTag, useTags } from '../hooks';
import { parseColonTag } from '../lib/tag-colon';
import type { Tag } from '../types';
import { TagIcon } from './TagIcon';

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

  const { data: tags } = useTags();
  const mergeTagMutation = useMergeTag();
  const utils = trpc.useUtils();

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [error, setError] = useState('');
  const [view, setView] = useState<MergeView>({ type: 'grid' });

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

  // モーダルが開いたらタグ一覧を最新化（5分キャッシュが古い場合に備える）
  useEffect(() => {
    if (open) {
      void utils.tags.list.invalidate();
    }
  }, [open, utils]);

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

  const selectedTarget = mergeTargetTags.find((tag) => tag.id === selectedTargetId);

  const handleSelectTag = useCallback((tagId: string) => {
    setSelectedTargetId(tagId);
    setError('');
  }, []);

  const handleMerge = useCallback(async () => {
    if (!selectedTargetId) return;

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

  const description = selectedTarget
    ? t('calendar.filter.mergeTag.description', {
        sourceName: sourceTag.name,
        targetName: selectedTarget.name,
      })
    : t('calendar.filter.mergeTag.selectTarget');

  // ドリルダウン画面
  const renderDrillContent = (prefix: string) => {
    const children = childrenByPrefix.get(prefix) ?? [];
    const parentTag = topLevelTags.find((tag) => tag.name === prefix);

    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setView({ type: 'grid' })}
          className="hover:bg-state-hover flex min-h-11 items-center gap-2 px-4 py-2 transition-colors"
        >
          <ChevronLeft className="text-muted-foreground size-5" />
          {parentTag && <TagIcon icon={parentTag.icon} color={parentTag.color} size="sm" />}
          <span className="text-foreground font-medium">{prefix}</span>
        </button>

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

  // メイングリッド画面
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

  return (
    <DestructiveFormDialog
      open={open}
      onClose={onClose}
      onConfirm={handleMerge}
      title={t('calendar.filter.mergeTag.title')}
      description={description}
      confirmLabel={t('calendar.filter.mergeTag.confirm')}
      loadingLabel={t('calendar.toast.saving')}
      confirmDisabled={!selectedTargetId}
      responsive
      contentClassName="sm:max-w-sm"
    >
      {view.type === 'drill' ? renderDrillContent(view.prefix) : renderGridContent()}

      {error && (
        <p className="text-destructive px-4 text-sm" role="alert">
          {error}
        </p>
      )}
    </DestructiveFormDialog>
  );
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
