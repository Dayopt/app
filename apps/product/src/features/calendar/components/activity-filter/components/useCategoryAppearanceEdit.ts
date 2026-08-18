'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import type { TagColorName } from '@/features/tags';
import { resolveTagColor, useUpdateTag } from '@/features/tags';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

interface UseCategoryAppearanceEditProps {
  categoryId: string | undefined;
  initialColor: string | undefined;
}

interface UseCategoryAppearanceEditReturn {
  displayColor: string;
  handleColorChange: (color: TagColorName) => Promise<void>;
  handleIconChange: (icon: string | null) => Promise<void>;
}

/**
 * カテゴリーの見た目（色・アイコン）編集フック。
 *
 * 色とアイコンはカテゴリーだけが持ち、所属アクティビティは継承する。
 * 色は楽観的更新（サーバー値と一致したら派生状態が自動的に無視される）。
 */
export function useCategoryAppearanceEdit({
  categoryId,
  initialColor,
}: UseCategoryAppearanceEditProps): UseCategoryAppearanceEditReturn {
  const t = useTranslations();
  const updateMutation = useUpdateTag();

  const [optimisticColor, setOptimisticColor] = useState<TagColorName | null>(null);
  const displayColor =
    optimisticColor !== null && optimisticColor !== resolveTagColor(initialColor)
      ? optimisticColor
      : resolveTagColor(initialColor);

  const handleColorChange = useCallback(
    async (color: TagColorName) => {
      if (!categoryId) return;
      setOptimisticColor(color);
      try {
        await updateMutation.mutateAsync({ id: categoryId, color });
      } catch (error) {
        setOptimisticColor(null);
        logger.error('Category color change failed:', error);
        toast.error(t('tags.toast.updateFailed'));
      }
    },
    [categoryId, updateMutation, t],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!categoryId) return;
      try {
        await updateMutation.mutateAsync({ id: categoryId, icon });
      } catch (error) {
        logger.error('Category icon change failed:', error);
        toast.error(t('tags.toast.updateFailed'));
      }
    },
    [categoryId, updateMutation, t],
  );

  return { displayColor, handleColorChange, handleIconChange };
}
