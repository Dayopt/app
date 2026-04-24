'use client';

/**
 * タグモーダルナビゲーション Hook
 *
 * Zustand ストアベースのタグモーダル（マージ / リネーム）を開くユーティリティ。
 *
 * @example
 * const { openTagMergeModal, openTagRenameModal } = useTagModalNavigation();
 * openTagMergeModal({ id, name, color });
 * openTagRenameModal({ id, name, parent_id });
 */

import { useCallback } from 'react';

import { useShellStore } from '@/lib/stores/useShellStore';

export function useTagModalNavigation() {
  const openMerge = useShellStore.use.openTagMergeModal();
  const openRename = useShellStore.use.openTagRenameModal();

  /**
   * タグマージモーダルを開く
   *
   * @param sourceTag - マージ元（消える側）のタグ情報
   */
  const openTagMergeModal = useCallback(
    (sourceTag: { id: string; name: string; color?: string | null }) => {
      openMerge(sourceTag);
    },
    [openMerge],
  );

  /**
   * タグリネームモーダルを開く
   *
   * @param tag - リネーム対象タグ（id / name / parent_id）
   */
  const openTagRenameModal = useCallback(
    (tag: { id: string; name: string; parent_id: string | null }) => {
      openRename(tag);
    },
    [openRename],
  );

  return { openTagMergeModal, openTagRenameModal };
}
