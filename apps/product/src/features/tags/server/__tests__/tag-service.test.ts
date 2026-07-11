/**
 * Tag Service Unit Tests
 *
 * TagServiceのビジネスロジックをモックを使用してテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

const adminFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ from: adminFrom }),
}));

import { createTagService, TagService, TagServiceError } from '../tag-service';

describe('TagService', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: TagService;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adminFrom.mockImplementation(() => createChainableMock([], null));
    service = createTagService(mockSupabase as unknown as Parameters<typeof createTagService>[0]);
  });

  describe('list', () => {
    it('should return tags for user', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'Tag 1', user_id: userId },
        { id: 'tag-2', name: 'Tag 2', user_id: userId },
      ];

      setupMockQuery(mockSupabase.from, mockTags);

      const result = await service.list({ userId });

      // transformDbTagにより追加フィールドが付与されるためtoMatchObjectを使用
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'tag-1', name: 'Tag 1', user_id: userId });
      expect(result[1]).toMatchObject({ id: 'tag-2', name: 'Tag 2', user_id: userId });
      expect(mockSupabase.from).toHaveBeenCalledWith('tags');
    });

    it('should apply default sort (sort_order + name)', async () => {
      setupMockQuery(mockSupabase.from, [
        {
          id: 'child-2',
          name: 'B',
          user_id: userId,
          parent_id: 'root-1',
          sort_order: 1,
        },
        {
          id: 'root-2',
          name: 'Zeta',
          user_id: userId,
          parent_id: null,
          sort_order: 1,
        },
        {
          id: 'root-1',
          name: 'Alpha',
          user_id: userId,
          parent_id: null,
          sort_order: 0,
        },
        {
          id: 'child-1',
          name: 'A',
          user_id: userId,
          parent_id: 'root-1',
          sort_order: 0,
        },
      ]);

      const result = await service.list({ userId });

      expect(result.map((tag) => tag.id)).toEqual(['root-1', 'child-1', 'child-2', 'root-2']);
    });

    it('should apply custom sort', async () => {
      const mockQuery = setupMockQuery(mockSupabase.from, []);

      await service.list({ userId, sortField: 'created_at', sortOrder: 'desc' });

      // カスタムソート後、名前でセカンダリソート
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
        nullsFirst: false,
      });
      expect(mockQuery.order).toHaveBeenCalledWith('name', { ascending: true });
    });

    it('should throw TagServiceError on fetch failure', async () => {
      setupMockQueryError(mockSupabase.from, 'Database connection failed');

      await expect(service.list({ userId })).rejects.toThrow(TagServiceError);
      await expect(service.list({ userId })).rejects.toThrow('Failed to fetch tags');
    });
  });

  describe('getById', () => {
    it('should return tag by id', async () => {
      const mockTag = { id: 'tag-1', name: 'Tag 1', user_id: userId };

      const mockQuery = setupMockSingleQuery(mockSupabase.from, mockTag);

      const result = await service.getById({ userId, tagId: 'tag-1' });

      expect(result).toMatchObject(mockTag);
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('should allow inactive tag lookup only when explicitly requested', async () => {
      const mockTag = { id: 'tag-1', name: 'Tag 1', user_id: userId, is_active: false };

      const mockQuery = setupMockSingleQuery(mockSupabase.from, mockTag);

      const result = await service.getById({
        userId,
        tagId: 'tag-1',
        includeInactive: true,
      });

      expect(result).toMatchObject(mockTag);
      expect(mockQuery.eq).not.toHaveBeenCalledWith('is_active', true);
    });

    it('should throw NOT_FOUND when tag does not exist', async () => {
      setupMockSingleQuery(mockSupabase.from, null);

      await expect(service.getById({ userId, tagId: 'non-existent' })).rejects.toThrow(
        TagServiceError,
      );

      try {
        await service.getById({ userId, tagId: 'non-existent' });
      } catch (error) {
        expect((error as TagServiceError).code).toBe('NOT_FOUND');
      }
    });
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
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { migrated: 5, children_reparented: 0 },
        error: null,
      });

      const result = await service.merge({
        userId,
        sourceTagId: 'src',
        targetTagId: 'tgt',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('merge_tags_with_hierarchy', {
        p_user_id: userId,
        p_source_tag_id: 'src',
        p_target_tag_id: 'tgt',
      });
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
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should throw MERGE_FAILED on RPC error', async () => {
      const sourceTag = { id: 'src', name: 'Source', user_id: userId, parent_id: null };
      const targetTag = { id: 'tgt', name: 'Target', user_id: userId, parent_id: null };

      setupMockMergeQueries(mockSupabase.from, {
        sourceTag,
        targetTag,
        sourceChildrenCount: 0,
      });
      mockSupabase.rpc.mockResolvedValueOnce({
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
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.merge({
        userId,
        sourceTagId: 'src',
        targetTagId: 'tgt',
      });

      expect(result.mergedAssociations).toBe(0);
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

    it('reassign strategy: should update plans / logs tag_id', async () => {
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
      expect(adminFrom.mock.calls.map(([table]) => table)).toEqual(['plans', 'logs']);
      expect(deleteMock.delete).toHaveBeenCalled();
      expect(result).toMatchObject(existingTag);
    });

    it('delete_entries strategy: should delete logs / plans before deleting the tag', async () => {
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
        strategy: 'delete_entries',
      });

      expect(adminFrom.mock.calls.map(([table]) => table)).toEqual(['plans', 'logs', 'plans']);
      expect(dataDeleteMock.delete).toHaveBeenCalled();
      expect(tagDeleteMock.delete).toHaveBeenCalled();
    });
  });
});

// ヘルパー関数

// createChainableMock is imported from @/test/trpc-test-helpers

function setupMockQuery(mockFrom: ReturnType<typeof vi.fn>, data: unknown[]) {
  const mock = createChainableMock(data);
  mockFrom.mockReturnValue(mock);
  return mock;
}

function setupMockQueryError(mockFrom: ReturnType<typeof vi.fn>, errorMessage: string) {
  const mock = createChainableMock(null, { message: errorMessage });
  mockFrom.mockReturnValue(mock);
  return mock;
}

function setupMockSingleQuery(mockFrom: ReturnType<typeof vi.fn>, data: unknown) {
  const mock = createChainableMock(data, data ? null : { message: 'Not found', code: 'PGRST116' });
  mockFrom.mockReturnValue(mock);
  return mock;
}

function setupMockInsertQuery(
  mockFrom: ReturnType<typeof vi.fn>,
  data: unknown,
  siblings: unknown[] = [],
) {
  const siblingQuery = mockArrayResponse(siblings);
  const insertQuery = createChainableMock(data);
  mockFrom.mockReturnValueOnce(siblingQuery).mockReturnValueOnce(insertQuery);
  return insertQuery;
}

function setupMockUpdateQuery(
  mockFrom: ReturnType<typeof vi.fn>,
  existingData: unknown,
  updatedData: unknown,
) {
  let callCount = 0;
  const mock = createChainableMock(existingData);

  // Update single() to return different data based on call count
  mock.single = vi.fn().mockImplementation(() => {
    callCount++;
    return Promise.resolve({
      data: callCount === 1 ? existingData : updatedData,
      error: null,
    });
  });

  mockFrom.mockReturnValue(mock);
  return mock;
}

function setupMockDeleteQuery(mockFrom: ReturnType<typeof vi.fn>, existingData: unknown) {
  let callCount = 0;

  mockFrom.mockImplementation((table: string) => {
    callCount++;

    if (table === 'plan_tags') {
      return createChainableMock(null);
    }

    const mock = createChainableMock(existingData);
    mock.single = vi.fn().mockResolvedValue({
      data: callCount === 1 ? existingData : null,
      error: null,
    });
    mock.then = vi.fn().mockImplementation((resolve) => resolve({ data: null, error: null }));

    return mock;
  });
}

/** `await ...single()` 経由で 1 件返すモック */
function mockSingleResponse(data: unknown) {
  const mock = createChainableMock(data);
  mock.single = vi.fn().mockResolvedValue({ data, error: null });
  return mock;
}

/** await chain で配列を返すモック（select 結果の list） */
function mockArrayResponse(data: unknown[]) {
  const mock = createChainableMock(data);
  mock.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve({ data, error: null }));
  return mock;
}

/** `await ...select(.., { count, head: true })` で count を返すモック */
function mockCountResponse(count: number) {
  const mock = createChainableMock(null);
  mock.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve({ count, error: null }));
  return mock;
}

/** merge() 用: getById x2 + children-count 用の sequence をまとめてセット */
function setupMockMergeQueries(
  mockFrom: ReturnType<typeof vi.fn>,
  options: {
    sourceTag: unknown;
    targetTag: unknown;
    sourceChildrenCount: number;
  },
) {
  // 1: getById(source)  → single
  // 2: getById(target)  → single
  // 3: select children count → count
  mockFrom
    .mockReturnValueOnce(mockSingleResponse(options.sourceTag))
    .mockReturnValueOnce(mockSingleResponse(options.targetTag))
    .mockReturnValueOnce(mockCountResponse(options.sourceChildrenCount));
}
