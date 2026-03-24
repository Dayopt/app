import { create } from 'zustand';

interface MobileFilterSheetState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** モバイルフィルターシートの開閉状態 */
export const useMobileFilterSheetStore = create<MobileFilterSheetState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
