/**
 * Tag Service Unit Tests — 削除（delete / strategy 付き delete）
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
import {
  mockCountResponse,
  mockSingleResponse,
  setupMockDeleteQuery,
  setupMockSingleQuery,
} from './tag-service-test-helpers';

describe('TagService', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: TagService;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adminFrom.mockImplementation(() => createChainableMock([], null));
    adminRpc.mockResolvedValue({ data: 1, error: null });
    service = createTagService(mockSupabase as unknown as Parameters<typeof createTagService>[0]);
  });

  describe('delete', () => {
    const existingTag = {
      id: 'tag-1',
      name: 'To Delete',
      user_id: userId,
    };

    it('should delete tag and return deleted tag', async () => {
      setupMockDeleteQuery(mockSupabase.from, existingTag);

      const result = await service.delete({ userId, tagId: 'tag-1' });

      expect(result).toMatchObject(existingTag);
    });

    it('should throw NOT_FOUND when tag does not exist', async () => {
      setupMockSingleQuery(mockSupabase.from, null);

      await expect(service.delete({ userId, tagId: 'non-existent' })).rejects.toThrow(
        TagServiceError,
      );
    });
  });

  describe('delete (with strategy)', () => {
    const existingTag = { id: 'tag-1', name: 'To Delete', user_id: userId, parent_id: null };

    it('should throw INVALID_INPUT when tag has entries and no strategy is given', async () => {
      // 1: getById(tagId) → existingTag
      // 2: select children → []
      // 3: select entries count → 3
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(existingTag))
        .mockReturnValueOnce(mockCountResponse(3));

      await expect(service.delete({ userId, tagId: 'tag-1' })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('should throw INVALID_INPUT when reassign strategy lacks targetTagId', async () => {
      mockSupabase.from.mockReturnValueOnce(mockSingleResponse(existingTag));

      await expect(
        service.delete({ userId, tagId: 'tag-1', strategy: 'reassign' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('reassign strategy: should use the atomic tag deletion command', async () => {
      const targetTag = { id: 'tag-2', name: 'Target', user_id: userId, parent_id: null };

      // 1: getById(tagId)
      // 2: select children
      // 3: getById(targetTagId)
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(existingTag))
        .mockReturnValueOnce(mockSingleResponse(targetTag));
      adminRpc.mockResolvedValue({ data: 1, error: null });

      const result = await service.delete({
        userId,
        tagId: 'tag-1',
        strategy: 'reassign',
        targetTagId: 'tag-2',
      });

      expect(adminRpc).toHaveBeenCalledWith('delete_tags_with_timeblocks_command_v3', {
        p_promote_children: true,
        p_strategy: 'reassign',
        p_tag_ids: ['tag-1'],
        p_target_tag_id: 'tag-2',
        p_user_id: userId,
      });
      expect(result).toMatchObject(existingTag);
    });

    it('delete_blocks strategy: should use the atomic tag deletion command', async () => {
      mockSupabase.from.mockReturnValueOnce(mockSingleResponse(existingTag));
      adminRpc.mockResolvedValue({ data: 1, error: null });

      await service.delete({
        userId,
        tagId: 'tag-1',
        strategy: 'delete_blocks',
      });

      expect(adminRpc).toHaveBeenCalledWith('delete_tags_with_timeblocks_command_v3', {
        p_promote_children: true,
        p_strategy: 'delete_blocks',
        p_tag_ids: ['tag-1'],
        p_target_tag_id: null,
        p_user_id: userId,
      });
    });
  });
});
