import { beforeEach, describe, expect, it } from 'vitest';

import { migrateCalendarFilterState, useCalendarFilterStore } from '../useCalendarFilterStore';

describe('useCalendarFilterStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCalendarFilterStore.setState({
      visibleTagIds: new Set<string>(),
      initialized: false,
      showUntagged: true,
    });
  });

  describe('初期状態', () => {
    it('未初期化状態', () => {
      expect(useCalendarFilterStore.getState().initialized).toBe(false);
    });
  });

  describe('永続化', () => {
    it('Setを配列へ変換し、stateだけを保存する', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.setState({ initialized: true });

      expect(JSON.parse(localStorage.getItem('calendar-filter-storage') ?? '')).toEqual({
        state: {
          visibleTagIds: ['tag-1', 'tag-2'],
          initialized: true,
          showUntagged: true,
        },
        version: 6,
      });
    });

    it('v4以前の状態を初期値へ移行する', () => {
      expect(
        migrateCalendarFilterState(
          { visibleTagIds: new Set(['tag-1']), initialized: true, visibleTypes: ['planned'] },
          4,
        ),
      ).toEqual({ visibleTagIds: new Set<string>(), initialized: false, showUntagged: true });
    });

    it('v5からの移行はvisibleTagIds/initializedを保持しつつshowUntaggedをtrueにデフォルトする', () => {
      expect(
        migrateCalendarFilterState({ visibleTagIds: new Set(['tag-1']), initialized: true }, 5),
      ).toEqual({
        visibleTagIds: new Set(['tag-1']),
        initialized: true,
        showUntagged: true,
      });
    });

    it('showUntaggedが既に永続化されていればその値を保持する', () => {
      expect(
        migrateCalendarFilterState(
          { visibleTagIds: new Set(['tag-1']), initialized: true, showUntagged: false },
          5,
        ),
      ).toEqual({
        visibleTagIds: new Set(['tag-1']),
        initialized: true,
        showUntagged: false,
      });
    });
  });

  describe('toggleTag', () => {
    it('タグを追加できる', () => {
      useCalendarFilterStore.getState().toggleTag('tag-1');
      expect(useCalendarFilterStore.getState().visibleTagIds.has('tag-1')).toBe(true);
    });

    it('既存タグを削除できる', () => {
      useCalendarFilterStore.getState().toggleTag('tag-1');
      useCalendarFilterStore.getState().toggleTag('tag-1');
      expect(useCalendarFilterStore.getState().visibleTagIds.has('tag-1')).toBe(false);
    });
  });

  describe('showAllTags / hideAllTags', () => {
    it('全タグを表示できる', () => {
      const tagIds = ['tag-1', 'tag-2', 'tag-3'];
      useCalendarFilterStore.getState().showAllTags(tagIds);
      const state = useCalendarFilterStore.getState();
      expect(state.visibleTagIds.size).toBe(3);
    });

    it('全タグを非表示にできる', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.getState().hideAllTags();
      const state = useCalendarFilterStore.getState();
      expect(state.visibleTagIds.size).toBe(0);
    });

    it('hideAllTags: showUntaggedもfalseにする（全部隠す操作のため）', () => {
      expect(useCalendarFilterStore.getState().showUntagged).toBe(true);
      useCalendarFilterStore.getState().hideAllTags();
      expect(useCalendarFilterStore.getState().showUntagged).toBe(false);
    });
  });

  describe('グループ操作', () => {
    it('showGroupTags: グループ内タグを一括表示', () => {
      useCalendarFilterStore.getState().showGroupTags(['tag-1', 'tag-2']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(true);
      expect(ids.has('tag-2')).toBe(true);
    });

    it('hideGroupTags: グループ内タグを一括非表示', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      useCalendarFilterStore.getState().hideGroupTags(['tag-1', 'tag-2']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(false);
      expect(ids.has('tag-3')).toBe(true);
    });

    it('toggleGroupTags: 全ONなら全OFF', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      useCalendarFilterStore.getState().toggleGroupTags(['tag-1', 'tag-2']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(false);
      expect(ids.has('tag-2')).toBe(false);
      expect(ids.has('tag-3')).toBe(true);
    });

    it('toggleGroupTags: 一部OFFなら全ON', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1']);
      useCalendarFilterStore.getState().toggleGroupTags(['tag-1', 'tag-2']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(true);
      expect(ids.has('tag-2')).toBe(true);
    });
  });

  describe('syncWithTags', () => {
    it('初回は全タグを表示＆initializedをtrue', () => {
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'tag-2']);
      const state = useCalendarFilterStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.visibleTagIds.size).toBe(2);
    });

    it('2回目は既存 visible タグを保持しつつ新規タグを visible として追加', () => {
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'tag-2', 'tag-3']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(true);
      expect(ids.has('tag-2')).toBe(true);
      expect(ids.has('tag-3')).toBe(true);
    });

    it('削除済みタグ（orphan ID）は除去される', () => {
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'tag-2', 'tag-3']);
      // tag-3 が削除された想定で再 sync
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'tag-2']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(true);
      expect(ids.has('tag-2')).toBe(true);
      expect(ids.has('tag-3')).toBe(false);
    });

    it('一時 ID → 実 ID の置き換えで orphan が cleanup される', () => {
      useCalendarFilterStore.getState().syncWithTags(['tag-1']);
      // 楽観更新で temp-2 を追加
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'temp-2']);
      expect(useCalendarFilterStore.getState().visibleTagIds.has('temp-2')).toBe(true);
      // mutation 成功で temp-2 → real-2 に置き換わる
      useCalendarFilterStore.getState().syncWithTags(['tag-1', 'real-2']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(true);
      expect(ids.has('real-2')).toBe(true);
      expect(ids.has('temp-2')).toBe(false);
    });
  });

  describe('removeTag', () => {
    it('タグを削除できる', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.getState().removeTag('tag-1');
      expect(useCalendarFilterStore.getState().visibleTagIds.has('tag-1')).toBe(false);
      expect(useCalendarFilterStore.getState().visibleTagIds.has('tag-2')).toBe(true);
    });
  });

  describe('showOnly系', () => {
    it('showOnlyTag: 指定タグのみ表示', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      useCalendarFilterStore.getState().showOnlyTag('tag-2');
      const state = useCalendarFilterStore.getState();
      expect(state.visibleTagIds.size).toBe(1);
      expect(state.visibleTagIds.has('tag-2')).toBe(true);
    });

    it('showOnlyTag: showUntaggedをfalseにする（このタグだけ表示なら未分類は隠れる、#1576フォローアップ）', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      expect(useCalendarFilterStore.getState().showUntagged).toBe(true);
      useCalendarFilterStore.getState().showOnlyTag('tag-2');
      expect(useCalendarFilterStore.getState().showUntagged).toBe(false);
    });

    it('showOnlyGroupTags: 指定グループのタグのみ表示', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      useCalendarFilterStore.getState().showOnlyGroupTags(['tag-1', 'tag-3']);
      const state = useCalendarFilterStore.getState();
      expect(state.visibleTagIds.size).toBe(2);
    });

    it('showOnlyGroupTags: showUntaggedをfalseにする（対称性、#1576フォローアップ）', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      expect(useCalendarFilterStore.getState().showUntagged).toBe(true);
      useCalendarFilterStore.getState().showOnlyGroupTags(['tag-1', 'tag-3']);
      expect(useCalendarFilterStore.getState().showUntagged).toBe(false);
    });

    it('showOnlyUntagged: 未分類だけ表示（他のタグは全てOFF、visibleTagIdsが空になる対称性）', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.getState().toggleShowUntagged(); // 一旦 false にしておく
      useCalendarFilterStore.getState().showOnlyUntagged();
      const state = useCalendarFilterStore.getState();
      expect(state.visibleTagIds.size).toBe(0);
      expect(state.showUntagged).toBe(true);
    });
  });

  describe('showUntagged（未分類ブロックの表示切替、#1576）', () => {
    it('デフォルトはtrue（表示）', () => {
      expect(useCalendarFilterStore.getState().showUntagged).toBe(true);
    });

    it('toggleShowUntagged: falseへ切り替えられる', () => {
      useCalendarFilterStore.getState().toggleShowUntagged();
      expect(useCalendarFilterStore.getState().showUntagged).toBe(false);
    });

    it('toggleShowUntagged: 2回呼ぶと元に戻る', () => {
      useCalendarFilterStore.getState().toggleShowUntagged();
      useCalendarFilterStore.getState().toggleShowUntagged();
      expect(useCalendarFilterStore.getState().showUntagged).toBe(true);
    });

    it('toggleShowUntaggedは visibleTagIds に影響しない', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.getState().toggleShowUntagged();
      expect(useCalendarFilterStore.getState().visibleTagIds.size).toBe(2);
    });

    it('matchesTagFilter(null) はshowUntaggedの値をそのまま返す', () => {
      expect(useCalendarFilterStore.getState().matchesTagFilter(null)).toBe(true);
      useCalendarFilterStore.getState().toggleShowUntagged();
      expect(useCalendarFilterStore.getState().matchesTagFilter(null)).toBe(false);
    });

    it('isEntryVisible(null) はshowUntaggedの値をそのまま返す', () => {
      expect(useCalendarFilterStore.getState().isEntryVisible(null)).toBe(true);
      useCalendarFilterStore.getState().toggleShowUntagged();
      expect(useCalendarFilterStore.getState().isEntryVisible(null)).toBe(false);
    });

    it('showUntaggedがfalseでもタグ付きアイテムの判定には影響しない', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1']);
      useCalendarFilterStore.getState().toggleShowUntagged();
      expect(useCalendarFilterStore.getState().matchesTagFilter('tag-1')).toBe(true);
      expect(useCalendarFilterStore.getState().isEntryVisible(null)).toBe(false);
    });
  });

  describe('クエリ系', () => {
    it('isTagVisible', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1']);
      expect(useCalendarFilterStore.getState().isTagVisible('tag-1')).toBe(true);
      expect(useCalendarFilterStore.getState().isTagVisible('tag-99')).toBe(false);
    });

    it('getGroupVisibility: all / none / some', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2']);
      expect(useCalendarFilterStore.getState().getGroupVisibility(['tag-1', 'tag-2'])).toBe('all');

      useCalendarFilterStore.getState().toggleTag('tag-1');
      expect(useCalendarFilterStore.getState().getGroupVisibility(['tag-1', 'tag-2'])).toBe('some');

      useCalendarFilterStore.getState().hideAllTags();
      expect(useCalendarFilterStore.getState().getGroupVisibility(['tag-1', 'tag-2'])).toBe('none');
    });

    it('getGroupVisibility: 空配列はnone', () => {
      expect(useCalendarFilterStore.getState().getGroupVisibility([])).toBe('none');
    });

    it('matchesTagFilter: タグなしアイテムはshowUntagged(デフォルトtrue)に従う', () => {
      expect(useCalendarFilterStore.getState().matchesTagFilter(null)).toBe(true);
    });

    it('matchesTagFilter: タグ付きアイテム', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1']);
      expect(useCalendarFilterStore.getState().matchesTagFilter('tag-1')).toBe(true);
      expect(useCalendarFilterStore.getState().matchesTagFilter('tag-99')).toBe(false);
    });

    it('isEntryVisible: タグフィルターのチェック', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1']);
      expect(useCalendarFilterStore.getState().isEntryVisible('tag-1')).toBe(true);
      expect(useCalendarFilterStore.getState().isEntryVisible('tag-99')).toBe(false);
      expect(useCalendarFilterStore.getState().isEntryVisible(null)).toBe(true);
    });
  });
});
