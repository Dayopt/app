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

import { openTagMergeModal as openTagMerge } from '@/lib/hooks/useModalStore';

export function useTagModalNavigation() {
  /**
   * タグマージモーダルを開く
   *
   * @param sourceTag - マージ元（消える側）のタグ情報
   */
  const openTagMergeModal = useCallback(
    (sourceTag: { id: string; name: string; color?: string | null }) => {
      openTagMerge(sourceTag);
    },
    [],
  );

  return { openTagMergeModal };
}
