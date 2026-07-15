/**
 * Tag Service Unit Tests — 並び替え（reorder）
 *
 * TagServiceのビジネスロジックをモックを使用してテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

const adminFrom = vi.hoisted(() => vi.fn());
const adminRpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ from: adminFrom, rpc: adminRpc }),
}));

import { createTagService, TagService, TagServiceError } from '../tag-service';
import { setupMockQuery } from './tag-service-test-helpers';

describe('TagService', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: TagService;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adminFrom.mockImplementation(() => createChainableMock([], null));
    adminRpc.mockResolvedValue({ data: null, error: null });
    service = createTagService(mockSupabase as unknown as Parameters<typeof createTagService>[0]);
  });

  describe('reorder', () => {
    it('should return count=0 when updates is empty (early return, no DB call)', async () => {
      const result = await service.reorder({ userId, updates: [] });

      expect(result).toEqual({ count: 0 });
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should update sort_order via batch_reorder_tags RPC on success', async () => {
      // 所有権チェック: 全 tag が user のもの
      setupMockQuery(mockSupabase.from, [
        { id: 'tag-1', parent_id: null },
        { id: 'tag-2', parent_id: null },
      ]);
      mockSupabase.rpc.mockResolvedValueOnce({ data: 2, error: null });

      const result = await service.reorder({
        userId,
        updates: [
          { id: 'tag-1', parent_id: null, sort_order: 0 },
          { id: 'tag-2', parent_id: null, sort_order: 1 },
        ],
      });

      expect(result).toEqual({ count: 2 });
      expect(mockSupabase.rpc).toHaveBeenCalledWith('batch_reorder_tags_hierarchy', {
        p_user_id: userId,
        p_tag_ids: ['tag-1', 'tag-2'],
        p_parent_ids: [null, null],
        p_sort_orders: [0, 1],
      });
    });

    it('should throw NOT_FOUND when update includes a tag owned by another user', async () => {
      // tag-1 だけ自分のもの、tag-2 は所有権なし（select の結果に含まれない）
      setupMockQuery(mockSupabase.from, [{ id: 'tag-1', parent_id: null }]);

      await expect(
        service.reorder({
          userId,
          updates: [
            { id: 'tag-1', parent_id: null, sort_order: 0 },
            { id: 'tag-2', parent_id: null, sort_order: 1 },
          ],
        }),
      ).rejects.toThrow(TagServiceError);

      // RPC は呼ばれない（所有権チェックで早期 throw）
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should throw UPDATE_FAILED when RPC returns an error', async () => {
      setupMockQuery(mockSupabase.from, [{ id: 'tag-1', parent_id: null }]);
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });

      await expect(
        service.reorder({ userId, updates: [{ id: 'tag-1', parent_id: null, sort_order: 0 }] }),
      ).rejects.toThrow(/Failed to reorder tags/);
    });

    it('should fallback to updates.length when RPC returns non-numeric count', async () => {
      setupMockQuery(mockSupabase.from, [
        { id: 'tag-1', parent_id: null },
        { id: 'tag-2', parent_id: null },
      ]);
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.reorder({
        userId,
        updates: [
          { id: 'tag-1', parent_id: null, sort_order: 0 },
          { id: 'tag-2', parent_id: null, sort_order: 1 },
        ],
      });

      expect(result).toEqual({ count: 2 });
    });
  });
});
