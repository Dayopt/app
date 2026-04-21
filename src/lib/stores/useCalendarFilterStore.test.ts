import { beforeEach, describe, expect, it } from 'vitest';

import { useCalendarFilterStore } from './useCalendarFilterStore';

describe('useCalendarFilterStore', () => {
  beforeEach(() => {
    useCalendarFilterStore.setState({
      visibleTagIds: new Set<string>(),
      initialized: false,
    });
  });

  describe('初期状態', () => {
    it('未初期化状態', () => {
      expect(useCalendarFilterStore.getState().initialized).toBe(false);
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

  describe('initializeWithTags', () => {
    it('初回は全タグを表示＆initializedをtrue', () => {
      useCalendarFilterStore.getState().initializeWithTags(['tag-1', 'tag-2']);
      const state = useCalendarFilterStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.visibleTagIds.size).toBe(2);
    });

    it('2回目は既存タグは変更せず新しいタグを追加', () => {
      useCalendarFilterStore.getState().initializeWithTags(['tag-1', 'tag-2']);
      useCalendarFilterStore.getState().initializeWithTags(['tag-1', 'tag-2', 'tag-3']);
      const ids = useCalendarFilterStore.getState().visibleTagIds;
      expect(ids.has('tag-1')).toBe(true);
      expect(ids.has('tag-2')).toBe(true);
      expect(ids.has('tag-3')).toBe(true);
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

    it('showOnlyGroupTags: 指定グループのタグのみ表示', () => {
      useCalendarFilterStore.getState().showAllTags(['tag-1', 'tag-2', 'tag-3']);
      useCalendarFilterStore.getState().showOnlyGroupTags(['tag-1', 'tag-3']);
      const state = useCalendarFilterStore.getState();
      expect(state.visibleTagIds.size).toBe(2);
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

    it('matchesTagFilter: タグなしアイテムは常に表示', () => {
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
