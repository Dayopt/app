import { create } from 'zustand';

interface MobileCreateSheetState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** モバイル作成シートの開閉状態 */
export const useMobileCreateSheetStore = create<MobileCreateSheetState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
