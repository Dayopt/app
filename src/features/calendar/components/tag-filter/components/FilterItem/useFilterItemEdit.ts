'use client';

import { useCallback, useState } from 'react';

import { useUpdateTag } from '@/features/tags';
import type { TagColorName } from '@/lib/tag-colors';
import { resolveTagColor } from '@/lib/tag-colors';

interface UseFilterItemEditProps {
  tagId: string | undefined;
  initialColor: string | undefined;
}

interface UseFilterItemEditReturn {
  displayColor: string;
  handleColorChange: (color: TagColorName) => Promise<void>;
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
      } catch {
        setOptimisticColor(null);
      }
    },
    [tagId, updateTagMutation],
  );

  return {
    displayColor,
    handleColorChange,
  };
}
