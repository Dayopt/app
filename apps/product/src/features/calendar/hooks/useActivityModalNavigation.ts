'use client';

/**
 * アクティビティ / カテゴリーのモーダルを開くユーティリティ。
 *
 * 実体は `useShellStore` の `activeSheet`（shell 全体で 1 つしか開かない overlay）。
 * 統合（マージ）は v1 で持たないため入口も無い（#2162 §4-8）。
 *
 * @example
 * const { openActivityCreateModal, openActivityRenameModal } = useActivityModalNavigation();
 * openActivityRenameModal({ id, name });
 * openActivityCreateModal({ initialCategoryId });
 */

import { useCallback } from 'react';

import { useShellStore } from '@/lib/stores/useShellStore';

import type { ActivityCreateContext } from '@/lib/stores/useShellStore';

export function useActivityModalNavigation() {
  const openCreate = useShellStore.use.openActivityCreateModal();
  const openActivityRename = useShellStore.use.openActivityRenameModal();
  const openCategoryRename = useShellStore.use.openCategoryRenameModal();

  /**
   * アクティビティ作成モーダルを開く
   *
   * @param context - 任意。initialCategoryId / onCreated を渡せる
   */
  const openActivityCreateModal = useCallback(
    (context?: Partial<ActivityCreateContext>) => {
      openCreate(context);
    },
    [openCreate],
  );

  /** アクティビティの改名モーダルを開く */
  const openActivityRenameModal = useCallback(
    (activity: { id: string; name: string }) => {
      openActivityRename(activity);
    },
    [openActivityRename],
  );

  /** カテゴリーの改名モーダルを開く */
  const openCategoryRenameModal = useCallback(
    (category: { id: string; name: string }) => {
      openCategoryRename(category);
    },
    [openCategoryRename],
  );

  return { openActivityCreateModal, openActivityRenameModal, openCategoryRenameModal };
}
