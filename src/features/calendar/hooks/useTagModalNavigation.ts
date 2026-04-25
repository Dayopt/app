'use client';

/**
 * タグモーダルナビゲーション Hook
 *
 * Zustandストアベースのタグマージモーダルを開くためのユーティリティ。
 * タグ作成はインライン化されたため、この hook が管理するのは merge のみ。
 *
 * @example
 * const { openTagMergeModal } = useTagModalNavigation();
 * openTagMergeModal({ id: 'tag-id', name: 'Tag Name', color: 'blue' });
 */

import { useCallback } from 'react';

import { useShellStore } from '@/lib/stores/useShellStore';

export function useTagModalNavigation() {
  const open = useShellStore.use.openTagMergeModal();

  /**
   * タグマージモーダルを開く
   *
   * @param sourceTag - マージ元（消える側）のタグ情報
   */
  const openTagMergeModal = useCallback(
    (sourceTag: { id: string; name: string; color?: string | null }) => {
      open(sourceTag);
    },
    [open],
  );

  return { openTagMergeModal };
}
