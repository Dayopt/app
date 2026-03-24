'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/**
 * モーダルの状態を表す判別共用体型
 * `type` フィールドでTypeScriptの型絞り込みが有効
 */
export type ModalState =
  | {
      type: 'tagCreate';
      defaultGroup?: string;
    }
  | {
      type: 'tagMerge';
      sourceTag: { id: string; name: string; color?: string | null };
    };

interface ModalStoreState {
  /** 現在開いているモーダル（null = すべて閉じている） */
  modal: ModalState | null;
  /** モーダルを開く */
  openModal: (modal: ModalState) => void;
  /** モーダルを閉じる */
  closeModal: () => void;
}

const useModalStoreBase = create<ModalStoreState>()(
  devtools(
    (set) => ({
      modal: null,
      openModal: (modal) => set({ modal }),
      closeModal: () => set({ modal: null }),
    }),
    { name: 'modal-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

/**
 * 統合モーダルStore
 *
 * 旧 useDeleteConfirmStore, useTagCreateModalStore, useTagMergeModalStore を統合。
 * 設定モーダルは Intercepting Routes（/settings/[category]）に移行済み。
 *
 * @example
 * ```tsx
 * // モーダルの状態取得
 * const modal = useModalStore.use.modal();
 *
 * // モーダルを開く（便利関数を使用）
 * openTagCreateModal();
 *
 * // モーダルを閉じる
 * const closeModal = useModalStore.use.closeModal();
 * closeModal();
 * ```
 */
export const useModalStore = createSelectors(useModalStoreBase);

// ── 便利関数 ──

/** タグ作成モーダルを開く便利関数 */
export function openTagCreateModal(defaultGroup?: string) {
  useModalStore
    .getState()
    .openModal(defaultGroup ? { type: 'tagCreate', defaultGroup } : { type: 'tagCreate' });
}

/** タグマージモーダルを開く便利関数 */
export function openTagMergeModal(sourceTag: { id: string; name: string; color?: string | null }) {
  useModalStore.getState().openModal({ type: 'tagMerge', sourceTag });
}

/** 現在開いているモーダルを閉じる便利関数 */
export function closeModal() {
  useModalStore.getState().closeModal();
}
