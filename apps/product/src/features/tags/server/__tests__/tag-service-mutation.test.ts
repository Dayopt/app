/**
 * Tag Service Unit Tests — 作成・更新（create / update）
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
  setupMockInsertQuery,
  setupMockSingleQuery,
  setupMockUpdateQuery,
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

  describe('create', () => {
    it('should create a new tag with defaults', async () => {
      const mockTag = {
        id: 'new-tag-id',
        name: 'New Tag',
        color: 'blue',
        user_id: userId,
      };

      setupMockInsertQuery(mockSupabase.from, mockTag);

      const result = await service.create({
        userId,
        input: { name: 'New Tag' },
      });

      expect(result).toMatchObject(mockTag);
    });

    it('should create a tag with custom color', async () => {
      const mockTag = {
        id: 'new-tag-id',
        name: 'New Tag',
        color: 'red',
        user_id: userId,
      };

      setupMockInsertQuery(mockSupabase.from, mockTag);

      const result = await service.create({
        userId,
        input: { name: 'New Tag', color: 'red' },
      });

      expect(result.color).toBe('red');
    });

    it('should trim tag name', async () => {
      const mockTag = {
        id: 'new-tag-id',
        name: 'Trimmed Name',
        user_id: userId,
      };

      const mockQuery = setupMockInsertQuery(mockSupabase.from, mockTag);

      await service.create({
        userId,
        input: { name: '  Trimmed Name  ' },
      });

      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Trimmed Name', sort_order: 0 }),
      );
    });

    it('should shift existing siblings and create the new tag at sort_order 0', async () => {
      const mockTag = {
        id: 'new-tag-id',
        name: 'New Tag',
        user_id: userId,
        sort_order: 0,
      };
      const mockQuery = setupMockInsertQuery(mockSupabase.from, mockTag, [
        { id: 'tag-1', sort_order: 0 },
        { id: 'tag-2', sort_order: 1 },
      ]);

      await service.create({
        userId,
        input: { name: 'New Tag' },
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('batch_reorder_tags_hierarchy', {
        p_user_id: userId,
        p_tag_ids: ['tag-1', 'tag-2'],
        p_parent_ids: [null, null],
        p_sort_orders: [1, 2],
      });
      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 0 }));
    });

    it('should throw INVALID_INPUT for empty name', async () => {
      await expect(
        service.create({
          userId,
          input: { name: '' },
        }),
      ).rejects.toThrow(TagServiceError);

      try {
        await service.create({ userId, input: { name: '' } });
      } catch (error) {
        expect((error as TagServiceError).code).toBe('INVALID_INPUT');
      }
    });

    it('should throw INVALID_INPUT for whitespace-only name', async () => {
      await expect(
        service.create({
          userId,
          input: { name: '   ' },
        }),
      ).rejects.toThrow(TagServiceError);
    });

    it('should throw INVALID_INPUT for name exceeding 50 characters', async () => {
      const longName = 'a'.repeat(51);

      await expect(
        service.create({
          userId,
          input: { name: longName },
        }),
      ).rejects.toThrow(TagServiceError);

      try {
        await service.create({ userId, input: { name: longName } });
      } catch (error) {
        expect((error as TagServiceError).code).toBe('INVALID_INPUT');
        expect((error as TagServiceError).message).toContain('50 characters');
      }
    });

    it('should throw DUPLICATE_NAME for duplicate tag name', async () => {
      mockSupabase.from
        .mockReturnValueOnce(createChainableMock([]))
        .mockReturnValueOnce(
          createChainableMock(null, { message: 'Duplicate key', code: '23505' }),
        );

      await expect(service.create({ userId, input: { name: 'Duplicate' } })).rejects.toMatchObject({
        code: 'DUPLICATE_NAME',
      });
    });

    it('should throw TAG_ARCHIVED and skip the insert when parentId is an archived tag', async () => {
      const archivedParent = {
        id: 'parent-1',
        name: 'Parent',
        user_id: userId,
        parent_id: null,
        archived_at: '2026-01-01T00:00:00.000Z',
      };
      const mockQuery = setupMockSingleQuery(mockSupabase.from, archivedParent);

      await expect(
        service.create({ userId, input: { name: 'Child', parentId: 'parent-1' } }),
      ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

      // insert（DB書き込み）が実行されない
      expect(mockQuery.insert).not.toHaveBeenCalled();
      // makeRoomAtTop にも進まない（from は親の getById 1 回のみ）
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const existingTag = {
      id: 'tag-1',
      name: 'Original',
      color: 'blue',
      user_id: userId,
    };

    it('should update tag name', async () => {
      const updatedTag = { ...existingTag, name: 'Updated' };

      setupMockUpdateQuery(mockSupabase.from, existingTag, updatedTag);

      const result = await service.update({
        userId,
        tagId: 'tag-1',
        updates: { name: 'Updated' },
      });

      expect(result.name).toBe('Updated');
    });

    it('should update tag color', async () => {
      const updatedTag = { ...existingTag, color: 'red' };

      setupMockUpdateQuery(mockSupabase.from, existingTag, updatedTag);

      const result = await service.update({
        userId,
        tagId: 'tag-1',
        updates: { color: 'red' },
      });

      expect(result.color).toBe('red');
    });

    it('should throw INVALID_INPUT for empty name update', async () => {
      setupMockSingleQuery(mockSupabase.from, existingTag);

      await expect(
        service.update({
          userId,
          tagId: 'tag-1',
          updates: { name: '' },
        }),
      ).rejects.toThrow(TagServiceError);
    });

    it('should throw NOT_FOUND when tag does not exist', async () => {
      setupMockSingleQuery(mockSupabase.from, null);

      await expect(
        service.update({
          userId,
          tagId: 'non-existent',
          updates: { name: 'New Name' },
        }),
      ).rejects.toThrow(TagServiceError);
    });

    it('should throw TAG_ARCHIVED and skip the update when moving a tag under an archived parent', async () => {
      const archivedParent = {
        id: 'parent-1',
        name: 'Parent',
        user_id: userId,
        parent_id: null,
        archived_at: '2026-01-01T00:00:00.000Z',
      };

      // 1: getById(tagId) → 更新対象自身, 2: getById(parentId) → 新親候補（アーカイブ済み）
      mockSupabase.from
        .mockReturnValueOnce(createChainableMock(existingTag))
        .mockReturnValueOnce(createChainableMock(archivedParent));

      await expect(
        service.update({
          userId,
          tagId: 'tag-1',
          updates: { parentId: 'parent-1' },
        }),
      ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

      // 子タグ件数チェックにも update（DB書き込み）にも進まない（from は getById 2 回のみ）
      expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    });
  });
});
