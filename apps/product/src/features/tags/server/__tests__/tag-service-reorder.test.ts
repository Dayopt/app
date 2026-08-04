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

    it('should throw TAG_ARCHIVED when a reorder target tag is itself archived', async () => {
      setupMockQuery(mockSupabase.from, [
        { id: 'tag-1', parent_id: null, archived_at: '2026-01-01T00:00:00.000Z' },
      ]);

      await expect(
        service.reorder({ userId, updates: [{ id: 'tag-1', parent_id: null, sort_order: 0 }] }),
      ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

      // RPC は呼ばれない（検証で早期 throw、PL/pgSQL 側の batch RPC には手を入れない）
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should throw TAG_ARCHIVED when moving a tag under an archived parent (stale drag payload)', async () => {
      // parent-1 は別タブで既にアーカイブ済み。ドラッグ元のツリースナップショットは
      // アーカイブ前に取得されているため、古い payload は tag-1 を parent-1 の子として
      // 送ってしまう（#1576 の回帰シナリオ）。tag-1（非アーカイブ）の検証が先に走るよう
      // 配列順を「子 → 親」にして、parent_id 経由の archived 判定を狙って踏む。
      setupMockQuery(mockSupabase.from, [
        { id: 'tag-1', parent_id: null, archived_at: null },
        { id: 'parent-1', parent_id: null, archived_at: '2026-01-01T00:00:00.000Z' },
      ]);

      await expect(
        service.reorder({
          userId,
          updates: [
            { id: 'tag-1', parent_id: 'parent-1', sort_order: 0 },
            { id: 'parent-1', parent_id: null, sort_order: 0 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should allow normal reorder when no tags are archived (regression)', async () => {
      setupMockQuery(mockSupabase.from, [
        { id: 'tag-1', parent_id: null, archived_at: null },
        { id: 'tag-2', parent_id: null, archived_at: null },
      ]);
      mockSupabase.rpc.mockResolvedValueOnce({ data: 2, error: null });

      const result = await service.reorder({
        userId,
        updates: [
          { id: 'tag-1', parent_id: null, sort_order: 0 },
          { id: 'tag-2', parent_id: 'tag-1', sort_order: 0 },
        ],
      });

      expect(result).toEqual({ count: 2 });
      expect(mockSupabase.rpc).toHaveBeenCalledWith('batch_reorder_tags_hierarchy', {
        p_user_id: userId,
        p_tag_ids: ['tag-1', 'tag-2'],
        p_parent_ids: [null, 'tag-1'],
        p_sort_orders: [0, 0],
      });
    });
  });
});
