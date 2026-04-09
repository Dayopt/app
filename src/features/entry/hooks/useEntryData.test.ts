import { describe, expect, it, vi } from 'vitest';

import { entryToEntryItem, type EntryWithTagIds } from './useEntryData';

// テスト用のモックエントリ
const createMockEntry = (overrides: Partial<EntryWithTagIds> = {}): EntryWithTagIds => ({
  id: 'test-id',
  user_id: 'user-1',
  title: 'テストエントリ',
  description: null,
  origin: 'planned',
  start_time: null,
  end_time: null,
  actual_start_time: null,
  actual_end_time: null,
  duration_minutes: null,
  fulfillment_score: null,
  reminder_minutes: null,
  reviewed_at: null,
  backed_up_start_time: null,
  backed_up_end_time: null,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  tagId: null,
  ...overrides,
});

describe('useEntryData', () => {
  describe('entryToEntryItem', () => {
    it('基本的なエントリを変換できる', () => {
      const entry = createMockEntry({
        id: 'entry-1',
        title: 'タスク1',
        description: '説明文',
      });

      const result = entryToEntryItem(entry);

      expect(result.id).toBe('entry-1');
      expect(result.title).toBe('タスク1');
      expect(result.description).toBe('説明文');
    });

    it('未来のstart_timeがあるエントリはopen', () => {
      const entry = createMockEntry({
        id: 'entry-2',
        title: 'スケジュール済みタスク',
        start_time: '2099-01-20T09:00:00Z',
        end_time: '2099-01-20T10:00:00Z',
      });

      const result = entryToEntryItem(entry);

      expect(result.status).toBe('open');
    });

    it('過去のend_timeがあるエントリはclosed', () => {
      const entry = createMockEntry({
        id: 'entry-3',
        title: '完了済みタスク',
        start_time: '2020-01-20T09:00:00Z',
        end_time: '2020-01-20T10:00:00Z',
      });

      const result = entryToEntryItem(entry);

      expect(result.status).toBe('closed');
    });

    it('tagIdが正しくパススルーされる', () => {
      const entry = createMockEntry({
        id: 'entry-1',
        tagId: 'tag-1',
      });

      const result = entryToEntryItem(entry);

      expect(result.tagId).toBe('tag-1');
    });

    it('tagIdがnullの場合はnullがパススルーされる', () => {
      const entry = createMockEntry({
        id: 'entry-1',
        tagId: null,
      });

      const result = entryToEntryItem(entry);

      expect(result.tagId).toBeNull();
    });

    it('時間関連のフィールドを正しく変換する', () => {
      const entry = createMockEntry({
        id: 'entry-1',
        start_time: '2025-01-20T09:00:00Z',
        end_time: '2025-01-20T10:00:00Z',
      });

      const result = entryToEntryItem(entry);

      expect(result.start_time).toBe('2025-01-20T09:00:00Z');
      expect(result.end_time).toBe('2025-01-20T10:00:00Z');
    });

    it('created_atがnullの場合は現在時刻を使用する', () => {
      vi.useFakeTimers();
      const now = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(now);

      const entry = createMockEntry({
        id: 'entry-1',
        created_at: null,
        updated_at: null,
      });

      const result = entryToEntryItem(entry);

      expect(result.created_at).toBe(now.toISOString());
      expect(result.updated_at).toBe(now.toISOString());

      vi.useRealTimers();
    });

    it('descriptionがnullの場合はundefinedになる', () => {
      const entry = createMockEntry({
        id: 'entry-1',
        description: null,
      });

      const result = entryToEntryItem(entry);

      expect(result.description).toBeUndefined();
    });
  });
});
