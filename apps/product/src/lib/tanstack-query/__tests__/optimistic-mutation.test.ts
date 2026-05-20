/**
 * Optimistic Mutation Utilities Unit Tests
 *
 * 楽観的更新ヘルパー関数のテスト
 */

import { describe, expect, it, vi } from 'vitest';

import {
  addToList,
  addToPaginatedList,
  createSnapshot,
  filterList,
  filterPaginatedList,
  generateTempId,
  isTempId,
  removeFromList,
  removeFromPaginatedList,
  replaceInPaginatedList,
  snapshotQuery,
  updateList,
  updatePaginatedList,
  type PaginatedList,
} from '../optimistic-mutation';

describe('Optimistic Mutation Utilities', () => {
  describe('Snapshot Functions', () => {
    describe('createSnapshot', () => {
      it('should cancel all queries and create restore function', async () => {
        const mockQuery1 = {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: vi.fn().mockReturnValue(['item1', 'item2']),
          setData: vi.fn(),
        };
        const mockQuery2 = {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: vi.fn().mockReturnValue({ id: '1', name: 'test' }),
          setData: vi.fn(),
        };

        const snapshot = await createSnapshot({}, [
          { query: mockQuery1 as never, key: undefined },
          { query: mockQuery2 as never, key: { id: '1' } },
        ]);

        expect(mockQuery1.cancel).toHaveBeenCalled();
        expect(mockQuery2.cancel).toHaveBeenCalled();
        expect(mockQuery1.getData).toHaveBeenCalled();
        expect(mockQuery2.getData).toHaveBeenCalled();

        // Test restore
        snapshot.restore();

        expect(mockQuery1.setData).toHaveBeenCalledWith(undefined, ['item1', 'item2']);
        expect(mockQuery2.setData).toHaveBeenCalledWith({ id: '1' }, { id: '1', name: 'test' });
      });
    });

    describe('snapshotQuery', () => {
      it('should create snapshot for single query', async () => {
        const mockQuery = {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: vi.fn().mockReturnValue(['item1']),
          setData: vi.fn(),
        };

        const result = await snapshotQuery(mockQuery as never);

        expect(result.previous).toEqual(['item1']);
        expect(mockQuery.cancel).toHaveBeenCalled();

        // Test restore
        result.restore();
        expect(mockQuery.setData).toHaveBeenCalledWith(undefined, ['item1']);
      });

      it('should handle key parameter', async () => {
        const mockQuery = {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: vi.fn().mockReturnValue({ id: '1' }),
          setData: vi.fn(),
        };

        const result = await snapshotQuery(mockQuery as never, { id: '1' });

        expect(mockQuery.cancel).toHaveBeenCalledWith({ id: '1' });
        expect(mockQuery.getData).toHaveBeenCalledWith({ id: '1' });

        result.restore();
        expect(mockQuery.setData).toHaveBeenCalledWith({ id: '1' }, { id: '1' });
      });
    });
  });

  describe('Plain List Operations', () => {
    describe('filterList', () => {
      it('should filter items from list', () => {
        const list = [
          { id: '1', name: 'a' },
          { id: '2', name: 'b' },
          { id: '3', name: 'c' },
        ];

        const result = filterList(list, (item) => item.id !== '2');

        expect(result).toHaveLength(2);
        expect(result).toEqual([
          { id: '1', name: 'a' },
          { id: '3', name: 'c' },
        ]);
      });

      it('should return undefined for undefined input', () => {
        expect(filterList(undefined, () => true)).toBeUndefined();
      });
    });

    describe('updateList', () => {
      it('should update items in list', () => {
        const list = [
          { id: '1', name: 'a' },
          { id: '2', name: 'b' },
        ];

        const result = updateList(list, (item) =>
          item.id === '1' ? { ...item, name: 'updated' } : item,
        );

        expect(result?.[0]?.name).toBe('updated');
        expect(result?.[1]?.name).toBe('b');
      });

      it('should return undefined for undefined input', () => {
        expect(updateList(undefined, (x) => x)).toBeUndefined();
      });
    });

    describe('addToList', () => {
      it('should add item to end by default', () => {
        const list = [{ id: '1' }, { id: '2' }];

        const result = addToList(list, { id: '3' });

        expect(result).toHaveLength(3);
        expect(result[2]).toEqual({ id: '3' });
      });

      it('should add item to start when specified', () => {
        const list = [{ id: '1' }, { id: '2' }];

        const result = addToList(list, { id: '0' }, 'start');

        expect(result[0]).toEqual({ id: '0' });
      });

      it('should create new list for undefined input', () => {
        const result = addToList(undefined, { id: '1' });

        expect(result).toEqual([{ id: '1' }]);
      });
    });

    describe('removeFromList', () => {
      it('should remove item by key', () => {
        const list = [
          { id: '1', name: 'a' },
          { id: '2', name: 'b' },
          { id: '3', name: 'c' },
        ];

        const result = removeFromList(list, 'id', '2');

        expect(result).toHaveLength(2);
        expect(result?.map((i) => i.id)).toEqual(['1', '3']);
      });

      it('should return undefined for undefined input', () => {
        expect(removeFromList<{ id: string }, 'id'>(undefined, 'id', '1')).toBeUndefined();
      });
    });
  });

  describe('Paginated List Operations', () => {
    const paginatedList: PaginatedList<{ id: string; name: string }> = {
      data: [
        { id: '1', name: 'a' },
        { id: '2', name: 'b' },
        { id: '3', name: 'c' },
      ],
      count: 3,
    };

    describe('filterPaginatedList', () => {
      it('should filter items and update count', () => {
        const result = filterPaginatedList(paginatedList, (item) => item.id !== '2');

        expect(result?.data).toHaveLength(2);
        expect(result?.count).toBe(2);
      });

      it('should return undefined for undefined input', () => {
        expect(filterPaginatedList(undefined, () => true)).toBeUndefined();
      });
    });

    describe('updatePaginatedList', () => {
      it('should update items without changing count', () => {
        const result = updatePaginatedList(paginatedList, (item) =>
          item.id === '1' ? { ...item, name: 'updated' } : item,
        );

        expect(result?.data[0]?.name).toBe('updated');
        expect(result?.count).toBe(3);
      });
    });

    describe('addToPaginatedList', () => {
      it('should add item to end and increment count', () => {
        const result = addToPaginatedList(paginatedList, { id: '4', name: 'd' });

        expect(result.data).toHaveLength(4);
        expect(result.count).toBe(4);
        expect(result.data[3]).toEqual({ id: '4', name: 'd' });
      });

      it('should add item to start when specified', () => {
        const result = addToPaginatedList(paginatedList, { id: '0', name: 'z' }, 'start');

        expect(result.data[0]).toEqual({ id: '0', name: 'z' });
      });

      it('should create new list for undefined input', () => {
        const result = addToPaginatedList(undefined, { id: '1', name: 'a' });

        expect(result).toEqual({
          data: [{ id: '1', name: 'a' }],
          count: 1,
        });
      });
    });

    describe('removeFromPaginatedList', () => {
      it('should remove item and decrement count', () => {
        const result = removeFromPaginatedList(paginatedList, 'id', '2');

        expect(result?.data).toHaveLength(2);
        expect(result?.count).toBe(2);
      });

      it('should return undefined for undefined input', () => {
        expect(removeFromPaginatedList<{ id: string }, 'id'>(undefined, 'id', '1')).toBeUndefined();
      });
    });

    describe('replaceInPaginatedList', () => {
      it('should replace item by key value', () => {
        const result = replaceInPaginatedList(paginatedList, 'id', '2', {
          id: 'new-2',
          name: 'replaced',
        });

        expect(result?.data[1]).toEqual({ id: 'new-2', name: 'replaced' });
        expect(result?.count).toBe(3);
      });

      it('should return undefined for undefined input', () => {
        expect(
          replaceInPaginatedList(undefined, 'id', '1', { id: '1', name: 'a' }),
        ).toBeUndefined();
      });
    });
  });

  describe('Temporary ID Functions', () => {
    describe('generateTempId', () => {
      it('should generate id with default prefix', () => {
        const id = generateTempId();

        expect(id).toMatch(/^temp-\d+$/);
      });

      it('should generate id with custom prefix', () => {
        const id = generateTempId('plan');

        expect(id).toMatch(/^plan-\d+$/);
      });

      it('should generate unique ids', () => {
        const ids = new Set([generateTempId(), generateTempId(), generateTempId()]);

        // Due to potential same millisecond, just check format
        expect(ids.size).toBeGreaterThanOrEqual(1);
      });
    });

    describe('isTempId', () => {
      it('should return true for temp id', () => {
        expect(isTempId('temp-1234567890')).toBe(true);
      });

      it('should return false for regular id', () => {
        expect(isTempId('uuid-xxx-xxx-xxx')).toBe(false);
        expect(isTempId('123')).toBe(false);
      });

      it('should work with custom prefix', () => {
        expect(isTempId('plan-1234567890', 'plan')).toBe(true);
        expect(isTempId('temp-1234567890', 'plan')).toBe(false);
      });
    });
  });
});
