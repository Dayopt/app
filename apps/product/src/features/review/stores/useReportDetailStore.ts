'use client';

/**
 * 詳細パネル（仕様 §6）の開閉状態。
 *
 * **persist しない。** フィルタ・レンズ（`useReportViewStore`）は「この画面をどう読むか」で
 * 端末に残す価値があるが、パネルが開いていたかどうかは次に開いた時に引き継ぐ意味が無い。
 * 期間移動でも閉じる（仕様 §5）ので、寿命は 1 回の閲覧より短い。
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * パネルのヘッダーが要る識別情報。
 *
 * 章の行・点が既に持っている値をそのまま預かる。ここで持たずに ID だけ渡すと、パネルが
 * 名前とカテゴリーを引くためだけに期間集計をもう一度読むことになる。
 */
export interface ReportDetailTarget {
  /** `null` はアクティビティ未設定の記録。 */
  activityId: string | null;
  name: string | null;
  categoryName: string | null;
  /** カテゴリー色（10 色名）。表示側が semantic token へ写す。 */
  color: string | null;
}

interface ReportDetailState {
  isOpen: boolean;
  /** 表示中の対象。閉じている時は `null`。 */
  target: ReportDetailTarget | null;
}

interface ReportDetailActions {
  /** 同じ対象なら閉じ、別の対象なら中身を差し替える（仕様 §5）。 */
  toggle: (target: ReportDetailTarget) => void;
  close: () => void;
}

type ReportDetailStore = ReportDetailState & ReportDetailActions;

export const useReportDetailStore = create<ReportDetailStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      target: null,

      toggle: (target) =>
        set(
          (state) =>
            // `activityId` は null を取りうるので、開閉の判定に `isOpen` を必ず含める
            state.isOpen && state.target?.activityId === target.activityId
              ? { isOpen: false, target: null }
              : { isOpen: true, target },
          undefined,
          'toggle',
        ),

      close: () => set({ isOpen: false, target: null }, undefined, 'close'),
    }),
    { name: 'ReportDetailStore' },
  ),
);
