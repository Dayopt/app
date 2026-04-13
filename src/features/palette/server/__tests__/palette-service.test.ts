/**
 * Palette Service Unit Tests
 *
 * PaletteServiceのビジネスロジックをモックを使用してテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import { createPaletteService, PaletteService, PaletteServiceError } from '../palette-service';

describe('PaletteService', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: PaletteService;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    service = createPaletteService(
      mockSupabase as unknown as Parameters<typeof createPaletteService>[0],
    );
  });

  describe('list', () => {
    it('should return pinned items ordered by sort_order', async () => {
      const mockItems = [
        { id: 'item-1', tag_id: 'tag-1', duration_minutes: 30, sort_order: 0, is_pinned: true },
        { id: 'item-2', tag_id: 'tag-2', duration_minutes: 60, sort_order: 1, is_pinned: true },
      ];

      const mock = createChainableMock(mockItems);
      mockSupabase.from.mockReturnValue(mock);

      const result = await service.list(userId);

      expect(result).toEqual(mockItems);
      expect(mockSupabase.from).toHaveBeenCalledWith('palette_items');
    });

    it('should return empty array when no items are pinned', async () => {
      const mock = createChainableMock([]);
      mockSupabase.from.mockReturnValue(mock);

      const result = await service.list(userId);

      expect(result).toEqual([]);
    });

    it('should throw FETCH_FAILED on database error', async () => {
      const mock = createChainableMock(null, { message: 'DB error' });
      mockSupabase.from.mockReturnValue(mock);

      await expect(service.list(userId)).rejects.toThrow(PaletteServiceError);

      try {
        await service.list(userId);
      } catch (error) {
        expect((error as PaletteServiceError).code).toBe('FETCH_FAILED');
      }
    });
  });

  describe('pin', () => {
    it('should pin a new item with next sort_order', async () => {
      // First call: get max sort_order
      const existingMock = createChainableMock([{ sort_order: 2 }]);
      // Second call: upsert
      const upsertMock = createChainableMock({ id: 'new-item-id' });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? existingMock : upsertMock;
      });

      const result = await service.pin(userId, { tagId: 'tag-1', durationMinutes: 30 });

      expect(result).toEqual({ id: 'new-item-id' });
    });

    it('should start sort_order at 0 when no existing items', async () => {
      const existingMock = createChainableMock([]);
      const upsertMock = createChainableMock({ id: 'new-item-id' });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? existingMock : upsertMock;
      });

      const result = await service.pin(userId, { tagId: 'tag-1', durationMinutes: 30 });

      expect(result).toEqual({ id: 'new-item-id' });
    });

    it('should throw PIN_FAILED on upsert error', async () => {
      const existingMock = createChainableMock([]);
      const upsertMock = createChainableMock(null, { message: 'Upsert failed' });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? existingMock : upsertMock;
      });

      await expect(service.pin(userId, { tagId: 'tag-1', durationMinutes: 30 })).rejects.toThrow(
        PaletteServiceError,
      );

      try {
        callCount = 0;
        await service.pin(userId, { tagId: 'tag-1', durationMinutes: 30 });
      } catch (error) {
        expect((error as PaletteServiceError).code).toBe('PIN_FAILED');
      }
    });
  });

  describe('unpin', () => {
    it('should delete the item and return success', async () => {
      const mock = createChainableMock(null);
      mockSupabase.from.mockReturnValue(mock);

      const result = await service.unpin(userId, 'item-1');

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith('palette_items');
    });

    it('should throw UNPIN_FAILED on delete error', async () => {
      const mock = createChainableMock(null, { message: 'Delete failed' });
      mockSupabase.from.mockReturnValue(mock);

      await expect(service.unpin(userId, 'item-1')).rejects.toThrow(PaletteServiceError);

      try {
        await service.unpin(userId, 'item-1');
      } catch (error) {
        expect((error as PaletteServiceError).code).toBe('UNPIN_FAILED');
      }
    });
  });

  describe('updateDuration', () => {
    it('should update duration and return success', async () => {
      const mock = createChainableMock(null);
      mockSupabase.from.mockReturnValue(mock);

      const result = await service.updateDuration(userId, 'item-1', 45);

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith('palette_items');
    });

    it('should throw UPDATE_FAILED on update error', async () => {
      const mock = createChainableMock(null, { message: 'Update failed' });
      mockSupabase.from.mockReturnValue(mock);

      await expect(service.updateDuration(userId, 'item-1', 45)).rejects.toThrow(
        PaletteServiceError,
      );

      try {
        await service.updateDuration(userId, 'item-1', 45);
      } catch (error) {
        expect((error as PaletteServiceError).code).toBe('UPDATE_FAILED');
      }
    });
  });

  describe('createPaletteService', () => {
    it('should create a PaletteService instance', () => {
      const instance = createPaletteService(
        mockSupabase as unknown as Parameters<typeof createPaletteService>[0],
      );
      expect(instance).toBeInstanceOf(PaletteService);
    });
  });
});
