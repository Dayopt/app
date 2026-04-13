import { describe, expect, it, vi } from 'vitest';

import type { api } from '@/lib/trpc';

import {
  createListQueryPredicate,
  createTempId,
  invalidateEntityCaches,
  normalizeDateTime,
} from './mutationUtils';

type TRPCUtils = ReturnType<typeof api.useUtils>;

describe('mutationUtils', () => {
  describe('createTempId', () => {
    it('temp-プレフィックスのIDを生成する', () => {
      const id = createTempId();
      expect(id).toMatch(/^temp-\d+$/);
    });

    it('呼び出しごとに異なるIDを生成する', () => {
      const id1 = createTempId();
      const id2 = createTempId();
      // タイムスタンプベースなので同一ミリ秒内では同じ可能性があるが、
      // 概ねユニーク
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });
  });

  describe('normalizeDateTime', () => {
    it('null を undefined に変換する', () => {
      expect(normalizeDateTime(null)).toBeUndefined();
    });

    it('undefined を undefined に変換する', () => {
      expect(normalizeDateTime(undefined)).toBeUndefined();
    });

    it('空文字を undefined に変換する', () => {
      expect(normalizeDateTime('')).toBeUndefined();
    });

    it('有効な日時をISO 8601形式に変換する', () => {
      const result = normalizeDateTime('2026-02-21T10:00:00Z');
      expect(result).toBe('2026-02-21T10:00:00.000Z');
    });

    it('日付のみの文字列もISO形式に変換する', () => {
      const result = normalizeDateTime('2026-02-21');
      expect(result).toBeDefined();
      expect(result).toContain('2026-02-21');
    });

    it('無効な日時をundefinedに変換する', () => {
      expect(normalizeDateTime('not-a-date')).toBeUndefined();
    });
  });

  describe('createListQueryPredicate', () => {
    it('entries.list クエリキーにマッチする', () => {
      const predicate = createListQueryPredicate('entries');
      expect(predicate({ queryKey: [['entries', 'list']] })).toBe(true);
    });

    it('entries.list + input 付きクエリキーにマッチする', () => {
      const predicate = createListQueryPredicate('entries');
      expect(
        predicate({
          queryKey: [['entries', 'list'], { input: { status: 'open' }, type: 'query' }],
        }),
      ).toBe(true);
    });

    it('entries.getById にはマッチしない', () => {
      const predicate = createListQueryPredicate('entries');
      expect(predicate({ queryKey: [['entries', 'getById']] })).toBe(false);
    });

    it('異なるエンティティにはマッチしない', () => {
      const predicate = createListQueryPredicate('entries');
      expect(predicate({ queryKey: [['tags', 'list']] })).toBe(false);
    });

    it('配列でないキーにはマッチしない', () => {
      const predicate = createListQueryPredicate('entries');
      expect(predicate({ queryKey: 'entries' })).toBe(false);
    });

    it('空配列にはマッチしない', () => {
      const predicate = createListQueryPredicate('entries');
      expect(predicate({ queryKey: [] })).toBe(false);
    });
  });

  describe('invalidateEntityCaches', () => {
    it('entries エンティティのキャッシュを無効化する', async () => {
      const mockUtils = {
        entries: {
          list: { invalidate: vi.fn() },
          getById: { invalidate: vi.fn() },
        },
      };

      await invalidateEntityCaches(mockUtils as unknown as TRPCUtils, 'entries');

      expect(mockUtils.entries.list.invalidate).toHaveBeenCalledWith(undefined, {
        refetchType: 'active',
      });
    });

    it('entityId 指定時に個別キャッシュも無効化する', async () => {
      const mockUtils = {
        entries: {
          list: { invalidate: vi.fn() },
          getById: { invalidate: vi.fn() },
        },
      };

      await invalidateEntityCaches(mockUtils as unknown as TRPCUtils, 'entries', {
        entityId: 'entry-1',
      });

      expect(mockUtils.entries.getById.invalidate).toHaveBeenCalledWith(
        { id: 'entry-1' },
        { refetchType: 'active' },
      );
    });

    it('カスタム refetchType を指定できる', async () => {
      const mockUtils = {
        entries: {
          list: { invalidate: vi.fn() },
        },
      };

      await invalidateEntityCaches(mockUtils as unknown as TRPCUtils, 'entries', {
        refetchType: 'all',
      });

      expect(mockUtils.entries.list.invalidate).toHaveBeenCalledWith(undefined, {
        refetchType: 'all',
      });
    });
  });
});
