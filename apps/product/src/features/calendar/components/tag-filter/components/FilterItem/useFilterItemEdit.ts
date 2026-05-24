'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import type { TagColorName } from '@/features/tags';
import { resolveTagColor, useUpdateTag } from '@/features/tags';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

interface UseFilterItemEditProps {
  tagId: string | undefined;
  initialColor: string | undefined;
}

interface UseFilterItemEditReturn {
  displayColor: string;
  handleColorChange: (color: TagColorName) => Promise<void>;
  handleIconChange: (icon: string | null) => Promise<void>;
}

/**
 * タグ編集用フック（色変更専用）
 *
 * 名前・ノート編集はダイアログベースに移行したため、
 * このフックは色変更の楽観的更新のみを担当する。
 */
export function useFilterItemEdit({
  tagId,
  initialColor,
}: UseFilterItemEditProps): UseFilterItemEditReturn {
  const t = useTranslations();
  const updateTagMutation = useUpdateTag();

  // Color optimistic update state（派生状態: サーバー色と一致したら自動的に無視される）
  const [optimisticColor, setOptimisticColor] = useState<TagColorName | null>(null);
  const displayColor =
    optimisticColor !== null && optimisticColor !== resolveTagColor(initialColor)
      ? optimisticColor
      : resolveTagColor(initialColor);

  // Color change with optimistic update
  const handleColorChange = useCallback(
    async (color: TagColorName) => {
      if (!tagId) return;
      setOptimisticColor(color);
      try {
        await updateTagMutation.mutateAsync({
          id: tagId,
          color,
        });
      } catch (error) {
        setOptimisticColor(null);
        logger.error('Tag color change failed:', error);
        toast.error(t('tags.toast.updateFailed'));
      }
    },
    [tagId, updateTagMutation, t],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!tagId) return;
      try {
        await updateTagMutation.mutateAsync({
          id: tagId,
          icon,
        });
      } catch (error) {
        logger.error('Tag icon change failed:', error);
        toast.error(t('tags.toast.updateFailed'));
      }
    },
    [tagId, updateTagMutation, t],
  );

  return {
    displayColor,
    handleColorChange,
    handleIconChange,
  };
}
