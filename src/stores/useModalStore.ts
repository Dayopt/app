'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/** 繰り返しプラン編集時の対象スコープ（この予定のみ・以降・すべて） */
export type RecurringEditScope = 'this' | 'thisAndFuture' | 'all';

/**
 * モーダルの状態を表す判別共用体型
 * `type` フィールドでTypeScriptの型絞り込みが有効
 */
export type ModalState =
  | {
      type: 'deleteConfirm';
      planId: string;
      planTitle: string | null;
      onConfirm: () => Promise<void>;
    }
  | {
      type: 'tagCreate';
      defaultGroup?: string;
    }
  | {
      type: 'tagMerge';
      sourceTag: { id: string; name: string; color?: string | null };
    }
  | {
      type: 'recurringEdit';
      planTitle: string | null;
      mode: 'edit' | 'delete';
      onConfirm: (scope: RecurringEditScope) => Promise<void>;
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
 * 旧 useDeleteConfirmStore, useTagCreateModalStore, useTagMergeModalStore,
 * useRecurringEditConfirmStore を統合。
 * 設定モーダルは Intercepting Routes（/settings/[category]）に移行済み。
 *
 * @example
 * ```tsx
 * // モーダルの状態取得
 * const modal = useModalStore.use.modal();
 * const isDeleteConfirm = modal?.type === 'deleteConfirm';
 *
 * // モーダルを開く（便利関数を使用）
 * openDeleteConfirm(planId, planTitle, onConfirm);
 *
 * // モーダルを閉じる
 * const closeModal = useModalStore.use.closeModal();
 * closeModal();
 * ```
 */
export const useModalStore = createSelectors(useModalStoreBase);

// ── 便利関数 ──

/** 削除確認モーダルを開く便利関数 */
export function openDeleteConfirm(
  planId: string,
  planTitle: string | null,
  onConfirm: () => Promise<void>,
) {
  useModalStore.getState().openModal({ type: 'deleteConfirm', planId, planTitle, onConfirm });
}

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

/** 繰り返しプラン編集確認モーダルを開く便利関数 */
export function openRecurringEditConfirm(
  planTitle: string | null,
  mode: 'edit' | 'delete',
  onConfirm: (scope: RecurringEditScope) => Promise<void>,
) {
  useModalStore.getState().openModal({ type: 'recurringEdit', planTitle, mode, onConfirm });
}

/** 現在開いているモーダルを閉じる便利関数 */
export function closeModal() {
  useModalStore.getState().closeModal();
}
