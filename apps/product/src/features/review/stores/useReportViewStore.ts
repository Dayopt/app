/**
 * `/report` の表示状態（フィルタとレンズ）。
 *
 * **端末ローカルにだけ持つ**（仕様 §2.2）。アカウント同期しないので、別ブラウザ・別端末には
 * 持ち越さない。分母の出し入れは「今この画面をどう読むか」であって、アカウントの設定ではない。
 *
 * **hidden を持つ**（visible ではない）。ここに載っていないカテゴリーは可視なので、新しく作った
 * カテゴリーは自動で分母に入る。`useCalendarFilterStore` が必要としている `knownActivityIds`
 * （「新規」と「意図的に隠した既知」を見分けるための第 3 の集合）は、この形では要らない。
 * 消えたカテゴリーの ID が `hiddenCategoryIds` に残っても、一致するカテゴリーが無いだけで無害。
 *
 * 名前が `-FilterStore` でないのは、フィルタに加えてレンズ（`segmentId`）も持つため。
 * `/report` の「今どう見えているか」を 1 つに束ねる（epic #2575 / #2578）。
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { platformStorage } from '@/lib/zustand/storage';

import { defaultReportFilterState } from '../domain/report/report-view-model';

interface ReportViewState {
  /** ここに無いカテゴリーは可視。新しく作ったカテゴリーは自動で可視になる。 */
  hiddenCategoryIds: string[];
  uncategorizedHidden: boolean;
  /** 余白（未記録時間）を分母に入れないか。仕様の `__margin`。 */
  marginHidden: boolean;
  /** セグメントレンズ。`null` は「すべて」（レンズなし）。 */
  segmentId: string | null;
}

interface ReportViewActions {
  toggleCategory: (categoryId: string) => void;
  toggleUncategorized: () => void;
  toggleMargin: () => void;
  setSegmentId: (segmentId: string | null) => void;
}

type ReportViewStore = ReportViewState & ReportViewActions;

/** 既定は「すべて可視・余白 on・レンズなし」。派生側の既定と 1 箇所で揃える。 */
function createInitialReportViewState(): ReportViewState {
  return {
    hiddenCategoryIds: [...defaultReportFilterState.hiddenCategoryIds],
    uncategorizedHidden: defaultReportFilterState.uncategorizedHidden,
    marginHidden: defaultReportFilterState.marginHidden,
    segmentId: null,
  };
}

/**
 * 永続化された state を現在の形へ寄せる。
 *
 * localStorage は他バージョンの Dayopt・拡張・手編集で壊れうるため、型が違う値は既定へ倒す。
 * `persist` の中へ書かず独立 export しているのは、そのまま unit test にかけるため。
 *
 * **`migrate` だけでなく `merge` にも渡す。** zustand の persist が `migrate` を呼ぶのは
 * 保存された version が現在と**違う**時だけ（zustand 5.0.14 `middleware.mjs`）。version が
 * 一致したまま中身が壊れている localStorage はサニタイズを素通りし、`hiddenCategoryIds` が
 * 配列でなければ `.includes()` でサイドバーごと落ちる。`merge` は毎回のハイドレーションで
 * 必ず呼ばれるので、こちらを実際の防波堤にする。
 *
 * version に依存しない形にしてある。`merge` が受け取るのは `migrate` 済みの state なので、
 * ここが版数で分岐すると、将来 v2 を書いた瞬間に v2 の state へ v1 の変換を再適用してしまう。
 * 版ごとの移行は `migrateReportViewState` 側に書く。
 */
function sanitizeReportViewState(persistedState: unknown): ReportViewState {
  const defaults = createInitialReportViewState();
  if (typeof persistedState !== 'object' || persistedState === null) return defaults;

  const hiddenCategoryIds = Reflect.get(persistedState, 'hiddenCategoryIds');
  const uncategorizedHidden = Reflect.get(persistedState, 'uncategorizedHidden');
  const marginHidden = Reflect.get(persistedState, 'marginHidden');
  const segmentId = Reflect.get(persistedState, 'segmentId');

  return {
    hiddenCategoryIds: Array.isArray(hiddenCategoryIds)
      ? hiddenCategoryIds.filter((id): id is string => typeof id === 'string')
      : defaults.hiddenCategoryIds,
    uncategorizedHidden:
      typeof uncategorizedHidden === 'boolean' ? uncategorizedHidden : defaults.uncategorizedHidden,
    marginHidden: typeof marginHidden === 'boolean' ? marginHidden : defaults.marginHidden,
    segmentId: typeof segmentId === 'string' ? segmentId : null,
  };
}

/**
 * 版をまたぐ移行。今は v1 しか無いのでサニタイズと同義。
 *
 * v2 を足す時は、ここで `version` を見て形を変えてから `sanitizeReportViewState` を通す。
 */
export function migrateReportViewState(persistedState: unknown, _version: number): ReportViewState {
  return sanitizeReportViewState(persistedState);
}

/** `/report` のフィルタとレンズを持つ Zustand ストア（localStorage 永続化）。 */
export const useReportViewStore = create<ReportViewStore>()(
  devtools(
    persist<ReportViewStore, [], [], ReportViewState>(
      (set) => ({
        ...createInitialReportViewState(),

        toggleCategory: (categoryId) =>
          set((state) => ({
            hiddenCategoryIds: state.hiddenCategoryIds.includes(categoryId)
              ? state.hiddenCategoryIds.filter((id) => id !== categoryId)
              : [...state.hiddenCategoryIds, categoryId],
          })),

        toggleUncategorized: () =>
          set((state) => ({ uncategorizedHidden: !state.uncategorizedHidden })),

        toggleMargin: () => set((state) => ({ marginHidden: !state.marginHidden })),

        setSegmentId: (segmentId) => set({ segmentId }),
      }),
      {
        name: 'report-view-storage',
        version: 1,
        storage: platformStorage<ReportViewState>(),
        partialize: ({ hiddenCategoryIds, uncategorizedHidden, marginHidden, segmentId }) => ({
          hiddenCategoryIds,
          uncategorizedHidden,
          marginHidden,
          segmentId,
        }),
        migrate: migrateReportViewState,
        // version が一致していてもここは通る。壊れた値を state へ入れない最後の関門。
        // hydrate は replace 呼び出しなので `...currentState` で action を保つ
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...sanitizeReportViewState(persistedState),
        }),
      },
    ),
    { name: 'report-view-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
