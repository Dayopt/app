'use client';

/**
 * タグモーダルナビゲーション Hook
 *
 * Zustand ストアベースのタグモーダル（マージ / リネーム / 新規作成）を開くユーティリティ。
 *
 * @example
 * const { openTagMergeModal, openTagRenameModal, openTagCreateModal } = useTagModalNavigation();
 * openTagMergeModal({ id, name, color });
 * openTagRenameModal({ id, name, parent_id });
 * openTagCreateModal({ initialParentId, onCreated });
 */

import { useCallback } from 'react';

import { useShellStore } from '@/lib/stores/useShellStore';

import type { TagCreateContext } from '@/lib/stores/useShellStore';

export function useTagModalNavigation() {
  const openMerge = useShellStore.use.openTagMergeModal();
  const openRename = useShellStore.use.openTagRenameModal();
  const openCreate = useShellStore.use.openTagCreateModal();

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

  /**
   * タグ新規作成モーダルを開く
   *
   * @param context - 任意。initialParentId / onCreated を渡せる
   */
  const openTagCreateModal = useCallback(
    (context?: Partial<TagCreateContext>) => {
      openCreate(context);
    },
    [openCreate],
  );

  return { openTagMergeModal, openTagRenameModal, openTagCreateModal };
}
