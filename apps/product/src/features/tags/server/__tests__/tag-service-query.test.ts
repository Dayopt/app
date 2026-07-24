/**
 * Tag Service Unit Tests — 取得系（list / getById）
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
  setupMockQuery,
  setupMockQueryError,
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

    it('MCP用queryはowner・active・公開6 fieldだけを取得して既定順を保つ', async () => {
      const mockQuery = setupMockQuery(mockSupabase.from, [
        {
          id: 'child',
          name: 'Child',
          color: 'blue',
          icon: 'briefcase',
          parent_id: 'root',
          sort_order: 0,
        },
        {
          id: 'root',
          name: 'Root',
          color: null,
          icon: null,
          parent_id: null,
          sort_order: 0,
        },
      ]);

      const signal = new AbortController().signal;
      const result = await service.listForMcp({ userId, signal });

      expect(result.map((tag) => tag.id)).toEqual(['root', 'child']);
      expect(mockQuery.select).toHaveBeenCalledWith('id,name,color,icon,parent_id,sort_order');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId);
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true);
      expect(mockQuery.abortSignal).toHaveBeenCalledWith(signal);
      expect(result[0]).toMatchObject({
        user_id: userId,
        is_active: true,
        created_at: null,
        updated_at: null,
      });
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
});
