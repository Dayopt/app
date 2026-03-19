import { create } from 'zustand';

import { createSelectors } from '@/lib/zustand/createSelectors';

interface ContactStoreState {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** お問い合わせダイアログを開く */
  open: () => void;
  /** お問い合わせダイアログを閉じる */
  close: () => void;
}

const useContactStoreBase = create<ContactStoreState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

/** お問い合わせダイアログの開閉状態を管理するストア */
export const useContactStore = createSelectors(useContactStoreBase);
