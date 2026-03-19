'use client';

/**
 * タグモーダルナビゲーション Hook
 *
 * Zustandストアベースのタグモーダルを開くためのユーティリティ
 *
 * @example
 * const { openTagCreateModal, openTagMergeModal } = useTagModalNavigation();
 *
 * // タグ作成モーダルを開く
 * openTagCreateModal();
 *
 * // タグマージモーダルを開く
 * openTagMergeModal({ id: 'tag-id', name: 'Tag Name', color: 'blue' });
 */

import { useCallback } from 'react';

import {
  openTagCreateModal as openTagCreate,
  openTagMergeModal as openTagMerge,
} from '@/stores/useModalStore';

export function useTagModalNavigation() {
  /**
   * タグ作成モーダルを開く
   * @param defaultGroup - デフォルトのグループ名（コロン記法のプレフィックス）
   */
  const openTagCreateModal = useCallback((defaultGroup?: string) => {
    openTagCreate(defaultGroup);
  }, []);

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

  return {
    openTagCreateModal,
    openTagMergeModal,
  };
}
