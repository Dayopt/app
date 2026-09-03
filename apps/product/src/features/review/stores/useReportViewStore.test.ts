import { beforeEach, describe, expect, it } from 'vitest';

import { resolveVisibleActivities } from '../domain/report/report-view-model';
import { migrateReportViewState, useReportViewStore } from './useReportViewStore';

const STORAGE_KEY = 'report-view-storage';

function resetStore() {
  useReportViewStore.setState({
    hiddenCategoryIds: [],
    uncategorizedHidden: false,
    marginHidden: false,
    segmentId: null,
  });
}

describe('useReportViewStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  describe('既定値', () => {
    it('すべて可視・余白 on・レンズなしで始まる', () => {
      const state = useReportViewStore.getState();

      expect(state.hiddenCategoryIds).toEqual([]);
      expect(state.uncategorizedHidden).toBe(false);
      expect(state.marginHidden).toBe(false);
      expect(state.segmentId).toBeNull();
    });
  });

  describe('toggleCategory', () => {
    it('隠す / 戻すを往復できる', () => {
      useReportViewStore.getState().toggleCategory('cat-sleep');
      expect(useReportViewStore.getState().hiddenCategoryIds).toEqual(['cat-sleep']);

      useReportViewStore.getState().toggleCategory('cat-sleep');
      expect(useReportViewStore.getState().hiddenCategoryIds).toEqual([]);
    });

    it('複数のカテゴリーを独立に隠せる', () => {
      useReportViewStore.getState().toggleCategory('cat-sleep');
      useReportViewStore.getState().toggleCategory('cat-work');

      expect(useReportViewStore.getState().hiddenCategoryIds).toEqual(['cat-sleep', 'cat-work']);
    });

    /**
     * hidden 方式であることの本体。`useCalendarFilterStore` の `knownActivityIds` に当たる
     * 同期機構を持たなくても、後から増えたカテゴリーが分母に入る（受け入れ条件 3）。
     */
    it('store が知らないカテゴリーは可視のまま扱われる', () => {
      useReportViewStore.getState().toggleCategory('cat-sleep');

      const filter = {
        hiddenCategoryIds: useReportViewStore.getState().hiddenCategoryIds,
        uncategorizedHidden: useReportViewStore.getState().uncategorizedHidden,
        marginHidden: useReportViewStore.getState().marginHidden,
      };
      const visible = resolveVisibleActivities(
        [
          { ...activityAggregate('act-nap'), categoryId: 'cat-sleep' },
          // store が一度も見たことのない、あとから作られたカテゴリー
          { ...activityAggregate('act-walk'), categoryId: 'cat-brand-new' },
        ],
        filter,
      );

      expect(visible.map((activity) => activity.activityId)).toEqual(['act-walk']);
    });
  });

  describe('toggleUncategorized / toggleMargin', () => {
    it('それぞれ独立に反転する', () => {
      useReportViewStore.getState().toggleUncategorized();
      expect(useReportViewStore.getState().uncategorizedHidden).toBe(true);
      expect(useReportViewStore.getState().marginHidden).toBe(false);

      useReportViewStore.getState().toggleMargin();
      expect(useReportViewStore.getState().marginHidden).toBe(true);
      expect(useReportViewStore.getState().uncategorizedHidden).toBe(true);
    });
  });

  describe('setSegmentId', () => {
    it('レンズを選び、null で「すべて」へ戻せる', () => {
      useReportViewStore.getState().setSegmentId('seg-1');
      expect(useReportViewStore.getState().segmentId).toBe('seg-1');

      useReportViewStore.getState().setSegmentId(null);
      expect(useReportViewStore.getState().segmentId).toBeNull();
    });
  });

  describe('永続化', () => {
    it('state だけを保存し、action は保存しない', () => {
      useReportViewStore.getState().toggleCategory('cat-sleep');
      useReportViewStore.getState().setSegmentId('seg-1');

      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).toEqual({
        state: {
          hiddenCategoryIds: ['cat-sleep'],
          uncategorizedHidden: false,
          marginHidden: false,
          segmentId: 'seg-1',
        },
        version: 1,
      });
    });

    /**
     * 純粋関数の test だけでは storage → deserialize → migrate の配線ミスを捕まえられない。
     * 実際の persist middleware を通す。
     */
    it('localStorage から実際に復元する', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: {
            hiddenCategoryIds: ['cat-work'],
            uncategorizedHidden: true,
            marginHidden: true,
            segmentId: 'seg-2',
          },
          version: 1,
        }),
      );

      await useReportViewStore.persist.rehydrate();

      const state = useReportViewStore.getState();
      expect(state.hiddenCategoryIds).toEqual(['cat-work']);
      expect(state.uncategorizedHidden).toBe(true);
      expect(state.marginHidden).toBe(true);
      expect(state.segmentId).toBe('seg-2');
    });

    /**
     * zustand は保存された version が現在と一致していると `migrate` を呼ばない。
     * サニタイズを `merge` にも掛けていないと、壊れた値がそのまま state へ入り、
     * `hiddenCategoryIds.includes()` でサイドバーが落ちる。
     */
    it('version が一致していても壊れた値をサニタイズする', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: {
            hiddenCategoryIds: 'cat-work',
            uncategorizedHidden: 'yes',
            marginHidden: null,
            segmentId: 42,
          },
          version: 1,
        }),
      );

      await useReportViewStore.persist.rehydrate();

      const state = useReportViewStore.getState();
      expect(state.hiddenCategoryIds).toEqual([]);
      expect(state.uncategorizedHidden).toBe(false);
      expect(state.marginHidden).toBe(false);
      expect(state.segmentId).toBeNull();
      // action は失われない（merge で currentState を土台にしている）
      expect(typeof state.toggleCategory).toBe('function');
    });
  });

  describe('migrateReportViewState', () => {
    it('正しい形はそのまま通す', () => {
      expect(
        migrateReportViewState(
          {
            hiddenCategoryIds: ['cat-work'],
            uncategorizedHidden: true,
            marginHidden: true,
            segmentId: 'seg-1',
          },
          1,
        ),
      ).toEqual({
        hiddenCategoryIds: ['cat-work'],
        uncategorizedHidden: true,
        marginHidden: true,
        segmentId: 'seg-1',
      });
    });

    it('object でない payload は既定へ倒す', () => {
      expect(migrateReportViewState('壊れた', 1)).toEqual({
        hiddenCategoryIds: [],
        uncategorizedHidden: false,
        marginHidden: false,
        segmentId: null,
      });
    });

    it('型の違う値を捨てて既定へ倒す', () => {
      expect(
        migrateReportViewState(
          {
            hiddenCategoryIds: 'cat-work',
            uncategorizedHidden: 'yes',
            marginHidden: 1,
            segmentId: 42,
          },
          1,
        ),
      ).toEqual({
        hiddenCategoryIds: [],
        uncategorizedHidden: false,
        marginHidden: false,
        segmentId: null,
      });
    });

    it('配列の中の非文字列だけを落とす', () => {
      expect(
        migrateReportViewState({ hiddenCategoryIds: ['cat-work', 7, null, 'cat-sleep'] }, 1),
      ).toEqual({
        hiddenCategoryIds: ['cat-work', 'cat-sleep'],
        uncategorizedHidden: false,
        marginHidden: false,
        segmentId: null,
      });
    });
  });
});

/** `resolveVisibleActivities` へ渡す最小の集計行。 */
function activityAggregate(activityId: string) {
  return {
    activityId,
    activityName: activityId,
    categoryId: null as string | null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    archived: false,
    recordedMinutes: 60,
    plannedMinutes: 0,
    plannedPastMinutes: 0,
    plannedPastBoxes: 0,
    recordBoxes: 1,
    fulfillment: { low: 0, medium: 0, high: 0 },
    byBucket: [],
  };
}
