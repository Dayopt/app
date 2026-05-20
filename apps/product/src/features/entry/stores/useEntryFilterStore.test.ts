import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useEntryFilterStore } from './useEntryFilterStore';

describe('useEntryFilterStore', () => {
  beforeEach(() => {
    // ストアをリセット
    act(() => {
      useEntryFilterStore.getState().reset();
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('初期状態', () => {
    it('statusは空配列', () => {
      const { status } = useEntryFilterStore.getState();
      expect(status).toEqual([]);
    });

    it('tagsは空配列', () => {
      const { tags } = useEntryFilterStore.getState();
      expect(tags).toEqual([]);
    });

    it('searchは空文字', () => {
      const { search } = useEntryFilterStore.getState();
      expect(search).toBe('');
    });

    it('assigneeは空文字', () => {
      const { assignee } = useEntryFilterStore.getState();
      expect(assignee).toBe('');
    });
  });

  describe('setStatus', () => {
    it('単一のステータスを設定できる', () => {
      act(() => {
        useEntryFilterStore.getState().setStatus(['open']);
      });

      const { status } = useEntryFilterStore.getState();
      expect(status).toEqual(['open']);
    });

    it('複数のステータスを設定できる', () => {
      act(() => {
        useEntryFilterStore.getState().setStatus(['open', 'closed']);
      });

      const { status } = useEntryFilterStore.getState();
      expect(status).toEqual(['open', 'closed']);
    });

    it('空配列で解除できる', () => {
      act(() => {
        useEntryFilterStore.getState().setStatus(['open']);
        useEntryFilterStore.getState().setStatus([]);
      });

      const { status } = useEntryFilterStore.getState();
      expect(status).toEqual([]);
    });
  });

  describe('setTags', () => {
    it('タグIDを設定できる', () => {
      act(() => {
        useEntryFilterStore.getState().setTags(['tag-1', 'tag-2']);
      });

      const { tags } = useEntryFilterStore.getState();
      expect(tags).toEqual(['tag-1', 'tag-2']);
    });

    it('空配列で解除できる', () => {
      act(() => {
        useEntryFilterStore.getState().setTags(['tag-1']);
        useEntryFilterStore.getState().setTags([]);
      });

      const { tags } = useEntryFilterStore.getState();
      expect(tags).toEqual([]);
    });
  });

  describe('setSearch', () => {
    it('検索文字列を設定できる', () => {
      act(() => {
        useEntryFilterStore.getState().setSearch('テスト検索');
      });

      const { search } = useEntryFilterStore.getState();
      expect(search).toBe('テスト検索');
    });

    it('空文字で解除できる', () => {
      act(() => {
        useEntryFilterStore.getState().setSearch('テスト');
        useEntryFilterStore.getState().setSearch('');
      });

      const { search } = useEntryFilterStore.getState();
      expect(search).toBe('');
    });
  });

  describe('setAssignee', () => {
    it('担当者を設定できる', () => {
      act(() => {
        useEntryFilterStore.getState().setAssignee('user-123');
      });

      const { assignee } = useEntryFilterStore.getState();
      expect(assignee).toBe('user-123');
    });
  });

  describe('reset', () => {
    it('全てのフィルターを初期状態に戻す', () => {
      // 各種フィルターを設定
      act(() => {
        useEntryFilterStore.getState().setStatus(['open', 'closed']);
        useEntryFilterStore.getState().setTags(['tag-1']);
        useEntryFilterStore.getState().setSearch('検索');
        useEntryFilterStore.getState().setAssignee('user-1');
      });

      // リセット
      act(() => {
        useEntryFilterStore.getState().reset();
      });

      const state = useEntryFilterStore.getState();
      expect(state.status).toEqual([]);
      expect(state.tags).toEqual([]);
      expect(state.search).toBe('');
      expect(state.assignee).toBe('');
    });
  });

  describe('複合フィルター', () => {
    it('複数のフィルターを同時に設定できる', () => {
      act(() => {
        useEntryFilterStore.getState().setStatus(['open']);
        useEntryFilterStore.getState().setTags(['tag-1']);
        useEntryFilterStore.getState().setSearch('重要');
      });

      const state = useEntryFilterStore.getState();
      expect(state.status).toEqual(['open']);
      expect(state.tags).toEqual(['tag-1']);
      expect(state.search).toBe('重要');
    });
  });
});
