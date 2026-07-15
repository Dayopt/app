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
  mockArrayResponse,
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
    adminRpc.mockResolvedValue({ data: null, error: null });
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
        .mockReturnValueOnce(mockArrayResponse([]))
        .mockReturnValueOnce(mockCountResponse(3));

      await expect(service.delete({ userId, tagId: 'tag-1' })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('should throw INVALID_INPUT when reassign strategy lacks targetTagId', async () => {
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(existingTag))
        .mockReturnValueOnce(mockArrayResponse([]));

      await expect(
        service.delete({ userId, tagId: 'tag-1', strategy: 'reassign' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('reassign strategy: should update plans / records tag_id', async () => {
      const targetTag = { id: 'tag-2', name: 'Target', user_id: userId, parent_id: null };

      // 1: getById(tagId)
      // 2: select children
      // 3: getById(targetTagId)
      const updateMock = createChainableMock(null);
      const deleteMock = createChainableMock(null);
      adminFrom.mockReturnValue(updateMock);

      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(existingTag))
        .mockReturnValueOnce(mockArrayResponse([]))
        .mockReturnValueOnce(mockSingleResponse(targetTag))
        .mockReturnValueOnce(deleteMock);

      const result = await service.delete({
        userId,
        tagId: 'tag-1',
        strategy: 'reassign',
        targetTagId: 'tag-2',
      });

      expect(updateMock.update).toHaveBeenCalledWith({ tag_id: 'tag-2' });
      expect(adminFrom.mock.calls.map(([table]) => table)).toEqual(['plans', 'records']);
      expect(deleteMock.delete).toHaveBeenCalled();
      expect(result).toMatchObject(existingTag);
    });

    it('delete_blocks strategy: should delete records / plans before deleting the tag', async () => {
      const planLookupMock = createChainableMock([]);
      const dataDeleteMock = createChainableMock(null);
      const tagDeleteMock = createChainableMock(null);
      adminFrom
        .mockReturnValueOnce(planLookupMock)
        .mockReturnValueOnce(dataDeleteMock)
        .mockReturnValueOnce(dataDeleteMock)
        .mockReturnValueOnce(dataDeleteMock);

      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(existingTag))
        .mockReturnValueOnce(mockArrayResponse([]))
        .mockReturnValueOnce(tagDeleteMock);

      await service.delete({
        userId,
        tagId: 'tag-1',
        strategy: 'delete_blocks',
      });

      expect(adminFrom.mock.calls.map(([table]) => table)).toEqual(['plans', 'records', 'plans']);
      expect(dataDeleteMock.delete).toHaveBeenCalled();
      expect(tagDeleteMock.delete).toHaveBeenCalled();
    });
  });
});
