'use client';

import { useCallback, useState } from 'react';

import type { CategoryColorName } from '@/features/activities';
import { resolveCategoryColor, useUpdateCategory } from '@/features/activities';

interface UseCategoryAppearanceEditProps {
  categoryId: string | undefined;
  initialColor: string | undefined;
}

interface UseCategoryAppearanceEditReturn {
  displayColor: string;
  handleColorChange: (color: CategoryColorName) => Promise<void>;
  handleIconChange: (icon: string | null) => Promise<void>;
}

/**
 * カテゴリーの見た目（色・アイコン）編集フック。
 *
 * 色とアイコンはカテゴリーだけが持ち、所属アクティビティは継承する。
 * 色は選択直後に派生状態で先出しし、サーバー値が追いついたらそちらへ戻る。
 * 失敗時の toast は `useUpdateCategory` が出すので、ここでは出さない（二重通知を避ける）。
 */
export function useCategoryAppearanceEdit({
  categoryId,
  initialColor,
}: UseCategoryAppearanceEditProps): UseCategoryAppearanceEditReturn {
  const updateMutation = useUpdateCategory();

  const [optimisticColor, setOptimisticColor] = useState<CategoryColorName | null>(null);
  const displayColor =
    optimisticColor !== null && optimisticColor !== resolveCategoryColor(initialColor)
      ? optimisticColor
      : resolveCategoryColor(initialColor);

  const handleColorChange = useCallback(
    async (color: CategoryColorName) => {
      if (!categoryId) return;
      setOptimisticColor(color);
      try {
        await updateMutation.mutateAsync({ id: categoryId, color });
      } catch {
        // 自分がまだ最新の楽観値である時だけ戻す。色を続けて変えた時に、
        // 先に投げた方が後から失敗して、後発の楽観表示まで消してしまうのを防ぐ
        setOptimisticColor((prev) => (prev === color ? null : prev));
      }
    },
    [categoryId, updateMutation],
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      if (!categoryId) return;
      try {
        await updateMutation.mutateAsync({ id: categoryId, icon });
      } catch {
        // 失敗時の復帰はキャッシュのロールバックに任せる（派生状態を持たないため）
      }
    },
    [categoryId, updateMutation],
  );

  return { displayColor, handleColorChange, handleIconChange };
}
