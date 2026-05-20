'use client';

/**
 * タグマージモーダル
 *
 * TagBadgeList を dialog に埋め込んで、マージ先タグを単一選択させる。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { DestructiveFormDialog } from '@/lib/components/ui/destructive-form-dialog';
import { logger } from '@/lib/logger';
import { trpc } from '@/lib/trpc/client';

import { useMergeTag, useTags } from '../hooks';
import { TagBadgeList } from './TagBadgeList';

interface TagMergeModalProps {
  open: boolean;
  onClose: () => void;
  sourceTag: { id: string; name: string; color?: string | null };
  /** マージ成功時のコールバック */
  onMergeSuccess?: () => void;
}

export function TagMergeModal({ open, onClose, sourceTag, onMergeSuccess }: TagMergeModalProps) {
  const t = useTranslations();

  const { data: tags } = useTags();
  const mergeTagMutation = useMergeTag();
  const utils = trpc.useUtils();

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [error, setError] = useState('');

  // モーダルが開いたらリセット
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(open);
    setSelectedTargetId('');
    setError('');
  } else if (open !== prevOpen) {
    setPrevOpen(open);
  }

  // モーダルが開いたらタグ一覧を最新化（5分キャッシュが古い場合に備える）
  useEffect(() => {
    if (open) {
      void utils.tags.list.invalidate();
    }
  }, [open, utils]);

  // マージ対象のタグ一覧（アクティブなもののみ、ソート済み）— 自分の除外は excludeIds で
  const mergeTargetTags = useMemo(() => {
    const active = (tags ?? []).filter((tag) => tag.is_active !== false);
    return [...active].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [tags]);

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
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit */}
      <div className="max-h-[50vh] overflow-y-auto">
        <TagBadgeList
          tags={mergeTargetTags}
          selectedId={selectedTargetId}
          onSelect={handleSelectTag}
          excludeIds={[sourceTag.id]}
          asRadioGroup
          ariaLabel={t('calendar.filter.mergeTag.title')}
        />
      </div>

      {error && (
        <p className="text-destructive px-4 text-sm" role="alert">
          {error}
        </p>
      )}
    </DestructiveFormDialog>
  );
}
