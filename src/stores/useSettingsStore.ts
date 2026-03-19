import { create } from 'zustand';

import type { SettingsCategory } from '@/types/settings';

interface SettingsStoreState {
  /** モーダルが開いているか */
  isOpen: boolean;
  /** 現在選択中のカテゴリ */
  category: SettingsCategory;
  /** 設定モーダルを開く（PC用） */
  open: (category?: SettingsCategory) => void;
  /** 設定モーダルを閉じる */
  close: () => void;
  /** カテゴリを切り替える（モーダル内ナビゲーション） */
  setCategory: (category: SettingsCategory) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  isOpen: false,
  category: 'profile',
  open: (category = 'profile') => set({ isOpen: true, category }),
  close: () => set({ isOpen: false }),
  setCategory: (category) => set({ category }),
}));
