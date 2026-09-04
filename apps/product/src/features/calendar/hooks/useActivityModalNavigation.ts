'use client';

/**
 * アクティビティ / カテゴリーのモーダルを開くユーティリティ。
 *
 * 実体は `useShellStore` の `activeSheet`（shell 全体で 1 つしか開かない overlay）。
 * 統合（マージ）は v1 で持たないため入口も無い（#2162 §4-8）。
 *
 * **開くのは必ず 1 tick 遅らせる。** これらのモーダルは背景を暗転させない
 * `modal={false}` で、外側クリックで閉じる。ドロップダウンの項目から開くと、
 * メニューを閉じた同じ `pointerup` がそのまま「外側クリック」と解釈され、
 * 出た瞬間に閉じてしまう（2026-09-03 実測）。macrotask へ逃がして層を分ける
 * （`requestAnimationFrame` は非表示タブで発火しないので使わない）。
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
      setTimeout(() => openCreate(context), 0);
    },
    [openCreate],
  );

  /** アクティビティの改名モーダルを開く */
  const openActivityRenameModal = useCallback(
    (activity: { id: string; name: string }) => {
      setTimeout(() => openActivityRename(activity), 0);
    },
    [openActivityRename],
  );

  /** カテゴリーの改名モーダルを開く */
  const openCategoryRenameModal = useCallback(
    (category: { id: string; name: string }) => {
      setTimeout(() => openCategoryRename(category), 0);
    },
    [openCategoryRename],
  );

  return { openActivityCreateModal, openActivityRenameModal, openCategoryRenameModal };
}
