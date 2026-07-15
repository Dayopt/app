/**
 * Tag Service Unit Tests — マージ（merge）
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
import { setupMockMergeQueries } from './tag-service-test-helpers';

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

  describe('merge', () => {
    it('should throw SAME_TAG_MERGE when source equals target', async () => {
      await expect(
        service.merge({
          userId,
          sourceTagId: 'tag-1',
          targetTagId: 'tag-1',
        }),
      ).rejects.toThrow(TagServiceError);

      try {
        await service.merge({
          userId,
          sourceTagId: 'tag-1',
          targetTagId: 'tag-1',
        });
      } catch (error) {
        expect((error as TagServiceError).code).toBe('SAME_TAG_MERGE');
      }
    });

    it('should call merge_tags_with_hierarchy RPC and propagate migrated count', async () => {
      const sourceTag = { id: 'src', name: 'Source', user_id: userId, parent_id: null };
      const targetTag = { id: 'tgt', name: 'Target', user_id: userId, parent_id: null };

      setupMockMergeQueries(mockSupabase.from, {
        sourceTag,
        targetTag,
        sourceChildrenCount: 0,
      });
      adminRpc.mockResolvedValueOnce({
        data: { migrated: 5, children_reparented: 0 },
        error: null,
      });

      const result = await service.merge({
        userId,
        sourceTagId: 'src',
        targetTagId: 'tgt',
      });

      expect(adminRpc).toHaveBeenCalledWith('merge_tags_with_hierarchy', {
        p_user_id: userId,
        p_source_tag_id: 'src',
        p_target_tag_id: 'tgt',
      });
      expect(mockSupabase.rpc).not.toHaveBeenCalledWith(
        'merge_tags_with_hierarchy',
        expect.anything(),
      );
      expect(result.success).toBe(true);
      expect(result.mergedAssociations).toBe(5);
      expect(result.targetTag).toMatchObject(targetTag);
    });

    it('should throw INVALID_INPUT when source has children and target is a child', async () => {
      const sourceTag = { id: 'src', name: 'Source', user_id: userId, parent_id: null };
      // target.parent_id !== null = target は child タグ
      const targetTag = { id: 'tgt', name: 'Target', user_id: userId, parent_id: 'other' };

      setupMockMergeQueries(mockSupabase.from, {
        sourceTag,
        targetTag,
        sourceChildrenCount: 2, // source に children あり
      });

      await expect(
        service.merge({ userId, sourceTagId: 'src', targetTagId: 'tgt' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      // RPC は呼ばれない（早期 throw）
      expect(adminRpc).not.toHaveBeenCalled();
    });

    it('should throw MERGE_FAILED on RPC error', async () => {
      const sourceTag = { id: 'src', name: 'Source', user_id: userId, parent_id: null };
      const targetTag = { id: 'tgt', name: 'Target', user_id: userId, parent_id: null };

      setupMockMergeQueries(mockSupabase.from, {
        sourceTag,
        targetTag,
        sourceChildrenCount: 0,
      });
      adminRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'rpc failed' },
      });

      await expect(
        service.merge({ userId, sourceTagId: 'src', targetTagId: 'tgt' }),
      ).rejects.toMatchObject({ code: 'MERGE_FAILED' });
    });

    it('should default mergedAssociations to 0 when RPC returns null', async () => {
      const sourceTag = { id: 'src', name: 'Source', user_id: userId, parent_id: null };
      const targetTag = { id: 'tgt', name: 'Target', user_id: userId, parent_id: null };

      setupMockMergeQueries(mockSupabase.from, {
        sourceTag,
        targetTag,
        sourceChildrenCount: 0,
      });
      adminRpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.merge({
        userId,
        sourceTagId: 'src',
        targetTagId: 'tgt',
      });

      expect(result.mergedAssociations).toBe(0);
    });
  });
});
