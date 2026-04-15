/**
 * History Service Unit Tests
 *
 * HistoryServiceのビジネスロジックをモックを使用してテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import { createHistoryService, HistoryService, HistoryServiceError } from '../history-service';

describe('HistoryService', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: HistoryService;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00Z'));
    mockSupabase = createMockSupabase();
    service = createHistoryService(
      mockSupabase as unknown as Parameters<typeof createHistoryService>[0],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRecentBlocks', () => {
    it('should return empty array when no entries exist', async () => {
      const entryMock = createChainableMock([]);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toEqual([]);
    });

    it('should aggregate entries by tag+duration and sort by score', async () => {
      const entryRows = [
        {
          tag_id: 'tag-a',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z', // today → weight 1.0
        },
        {
          tag_id: 'tag-a',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T08:00:00Z', // today → weight 1.0
        },
        {
          tag_id: 'tag-b',
          duration_minutes: 60,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-20T10:00:00Z', // 4 days ago → weight 0.4
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toHaveLength(2);
      // tag-a: score 2.0 (1.0 + 1.0) → first
      expect(result[0]).toMatchObject({ tagId: 'tag-a', durationMinutes: 30, score: 2.0 });
      // tag-b: score 0.4 → second
      expect(result[1]).toMatchObject({ tagId: 'tag-b', durationMinutes: 60, score: 0.4 });
    });

    it('should skip deleted entries', async () => {
      const entryRows = [
        {
          tag_id: 'tag-a',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: '2026-03-23T00:00:00Z',
          created_at: '2026-03-24T10:00:00Z',
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toEqual([]);
    });

    it('should calculate duration from start_time/end_time when duration_minutes is null', async () => {
      const entryRows = [
        {
          tag_id: 'tag-a',
          duration_minutes: null,
          start_time: '2026-03-24T10:00:00Z',
          end_time: '2026-03-24T10:45:00Z', // 45min → snaps to 45
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z',
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toHaveLength(1);
      expect(result[0]!.durationMinutes).toBe(45);
    });

    it('should snap duration to 15-minute intervals', async () => {
      const entryRows = [
        {
          tag_id: 'tag-a',
          duration_minutes: 22, // snaps to 15
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z',
        },
        {
          tag_id: 'tag-b',
          duration_minutes: 38, // snaps to 45
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z',
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result[0]!.durationMinutes).toBe(15);
      expect(result[1]!.durationMinutes).toBe(45);
    });

    it('should keep only the highest-scoring duration per tag', async () => {
      const entryRows = [
        {
          tag_id: 'tag-a',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z', // weight 1.0
        },
        {
          tag_id: 'tag-a',
          duration_minutes: 60,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T09:00:00Z', // weight 1.0
        },
        {
          tag_id: 'tag-a',
          duration_minutes: 60,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T08:00:00Z', // weight 1.0
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      // tag-a:60 has score 2.0, tag-a:30 has score 1.0
      // Only tag-a:60 should appear (dedup by tag)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ tagId: 'tag-a', durationMinutes: 60, score: 2.0 });
    });

    it('should limit results to 8 items', async () => {
      const entryRows = Array.from({ length: 10 }, (_, i) => ({
        tag_id: `tag-${i}`,
        duration_minutes: 30,
        start_time: null,
        end_time: null,
        deleted_at: null,
        created_at: '2026-03-24T10:00:00Z',
      }));
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toHaveLength(8);
    });

    it('should apply recency weights correctly', async () => {
      const entryRows = [
        {
          tag_id: 'tag-today',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T06:00:00Z', // < 1 day → 1.0
        },
        {
          tag_id: 'tag-yesterday',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-23T00:00:00Z', // ~1.5 days → 0.8
        },
        {
          tag_id: 'tag-3days',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-21T12:00:00Z', // ~3 days → 0.6
        },
        {
          tag_id: 'tag-week',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-18T12:00:00Z', // ~6 days → 0.4
        },
        {
          tag_id: 'tag-old',
          duration_minutes: 30,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-14T12:00:00Z', // ~10 days → 0.2
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toHaveLength(5);
      expect(result[0]!.score).toBe(1.0);
      expect(result[1]!.score).toBe(0.8);
      expect(result[2]!.score).toBe(0.6);
      expect(result[3]!.score).toBe(0.4);
      expect(result[4]!.score).toBe(0.2);
    });

    it('should throw FETCH_ENTRIES_FAILED on query error', async () => {
      const entryMock = createChainableMock(null, { message: 'DB error' });
      mockSupabase.from.mockReturnValue(entryMock);

      await expect(service.getRecentBlocks(userId)).rejects.toThrow(HistoryServiceError);

      try {
        await service.getRecentBlocks(userId);
      } catch (error) {
        expect((error as HistoryServiceError).code).toBe('FETCH_ENTRIES_FAILED');
      }
    });

    it('should skip entries with zero or negative duration', async () => {
      const entryRows = [
        {
          tag_id: 'tag-a',
          duration_minutes: 0,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z',
        },
        {
          tag_id: 'tag-b',
          duration_minutes: -5,
          start_time: null,
          end_time: null,
          deleted_at: null,
          created_at: '2026-03-24T10:00:00Z',
        },
      ];
      const entryMock = createChainableMock(entryRows);
      mockSupabase.from.mockReturnValue(entryMock);

      const result = await service.getRecentBlocks(userId);

      expect(result).toEqual([]);
    });
  });

  describe('createHistoryService', () => {
    it('should create a HistoryService instance', () => {
      const instance = createHistoryService(
        mockSupabase as unknown as Parameters<typeof createHistoryService>[0],
      );
      expect(instance).toBeInstanceOf(HistoryService);
    });
  });
});
