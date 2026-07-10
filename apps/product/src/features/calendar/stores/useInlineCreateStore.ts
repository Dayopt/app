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
  creationSource?: 'planned-gap' | undefined;
  /** Step 5 のレーン起点。保存先は最終的に end_at のルールが優先する。 */
  lane?: 'plan' | 'log' | undefined;
  /**
   * 「スキップして記録」で作成する場合、この記録を作る前にスキップする自動記録の id。
   * 作成が実際に確定する時にだけスキップする（パレットを閉じてキャンセルした時は何も変えない）。
   */
  skipEntryIds?: string[] | undefined;
}

interface InlineCreateState {
  pendingSelection: PendingSelection | null;
  setPendingSelection: (selection: PendingSelection) => void;
  clearPendingSelection: () => void;
  /** 既存 pendingSelection の時間フィールドを部分更新する（null 時 no-op） */
  updateSelectionTimes: (
    partial: Partial<Pick<PendingSelection, 'startHour' | 'startMinute' | 'endHour' | 'endMinute'>>,
  ) => void;
}

const useInlineCreateStoreBase = create<InlineCreateState>()(
  devtools(
    (set) => ({
      pendingSelection: null,
      setPendingSelection: (selection) => set({ pendingSelection: selection }),
      clearPendingSelection: () => set({ pendingSelection: null }),
      updateSelectionTimes: (partial) =>
        set((state) =>
          state.pendingSelection
            ? { pendingSelection: { ...state.pendingSelection, ...partial } }
            : state,
        ),
    }),
    { name: 'inline-create', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

/** インライン作成ストア（セレクタ付き） */
export const useInlineCreateStore = createSelectors(useInlineCreateStoreBase);
