import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

/**
 * ドラッグ選択によるインライン作成の状態管理
 *
 * ドラッグ終了 → pendingSelection セット → InlineTagPalette 表示
 * タグ選択 or 外部クリック → clearPendingSelection
 */

/** ドラッグ選択で確定した時間範囲 */
interface PendingSelection {
  date: Date;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface InlineCreateState {
  pendingSelection: PendingSelection | null;
  setPendingSelection: (selection: PendingSelection) => void;
  clearPendingSelection: () => void;
}

const useInlineCreateStoreBase = create<InlineCreateState>()(
  devtools(
    (set) => ({
      pendingSelection: null,
      setPendingSelection: (selection) => set({ pendingSelection: selection }),
      clearPendingSelection: () => set({ pendingSelection: null }),
    }),
    { name: 'inline-create', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

export const useInlineCreateStore = createSelectors(useInlineCreateStoreBase);
