import { create } from 'zustand';

interface ContactStoreState {
  /** ダイアログが開いているか */
  isOpen: boolean;
  /** お問い合わせダイアログを開く */
  open: () => void;
  /** お問い合わせダイアログを閉じる */
  close: () => void;
}

export const useContactStore = create<ContactStoreState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
