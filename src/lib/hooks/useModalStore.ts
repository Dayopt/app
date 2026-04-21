'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/**
 * モーダルの状態を表す判別共用体型
 * `type` フィールドでTypeScriptの型絞り込みが有効
 */
export type ModalState = {
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
 * タグ作成はインライン化されたため、Store 管理が必要なモーダルは tagMerge のみ。
 *
 * @example
 * ```tsx
 * const modal = useModalStore.use.modal();
 * openTagMergeModal({ id, name });
 * const closeModal = useModalStore.use.closeModal();
 * closeModal();
 * ```
 */
export const useModalStore = createSelectors(useModalStoreBase);

// ── 便利関数 ──

/** タグマージモーダルを開く便利関数 */
export function openTagMergeModal(sourceTag: { id: string; name: string; color?: string | null }) {
  useModalStore.getState().openModal({ type: 'tagMerge', sourceTag });
}

/** 現在開いているモーダルを閉じる便利関数 */
export function closeModal() {
  useModalStore.getState().closeModal();
}
