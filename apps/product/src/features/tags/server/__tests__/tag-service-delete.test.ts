/**
 * Tag Service Unit Tests — 削除
 *
 * タグ削除はタグ行の DELETE のみ行い、関連 Plan / Record には触れない
 * （FK ON DELETE SET NULL による未分類化が契約。#1576）
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

    it('should not touch plans / records（FK の SET NULL に任せる）', async () => {
      setupMockDeleteQuery(mockSupabase.from, existingTag);

      await service.delete({ userId, tagId: 'tag-1' });

      // service role client（plans / records の書き換え経路）が呼ばれないこと
      expect(adminFrom).not.toHaveBeenCalled();
      expect(adminRpc).not.toHaveBeenCalled();
    });

    it('should promote active children to root before deleting parent', async () => {
      const parentTag = { id: 'parent-1', name: 'Parent', user_id: userId, parent_id: null };
      const children = [{ id: 'child-1' }, { id: 'child-2' }];

      const childUpdateMock = createChainableMock(null);
      const tagDeleteMock = createChainableMock(null);

      // 1: getById → parent, 2: children select, 3: getNextSortOrder(sibling select),
      // 4-5: child updates, 6: tag delete
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(parentTag))
        .mockReturnValueOnce(mockArrayResponse(children))
        .mockReturnValueOnce(mockArrayResponse([{ sort_order: 4 }]))
        .mockReturnValueOnce(childUpdateMock)
        .mockReturnValueOnce(childUpdateMock)
        .mockReturnValueOnce(tagDeleteMock);

      await service.delete({ userId, tagId: 'parent-1' });

      expect(childUpdateMock.update).toHaveBeenCalledWith({ parent_id: null, sort_order: 5 });
      expect(childUpdateMock.update).toHaveBeenCalledWith({ parent_id: null, sort_order: 6 });
      expect(tagDeleteMock.delete).toHaveBeenCalled();
    });
  });
});
