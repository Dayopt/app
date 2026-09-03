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
 */
export function migrateReportViewState(persistedState: unknown, _version: number): ReportViewState {
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
      },
    ),
    { name: 'report-view-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
