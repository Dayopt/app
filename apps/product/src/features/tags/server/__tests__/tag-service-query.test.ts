/**
 * Tag Service Unit Tests — 取得系（list）
 *
 * TagServiceのビジネスロジックをモックを使用してテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

const adminFrom = vi.hoisted(() => vi.fn());
const adminRpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ from: adminFrom, rpc: adminRpc }),
}));

import { createTagService, TagService, TagServiceError } from '../tag-service';
import { setupMockQuery, setupMockQueryError } from './tag-service-test-helpers';

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
  });

  /**
   * #1825: active と archived を 2 本のクエリで読むと、その間にアーカイブが
   * commit された時に同じタグが両方へ現れるか、どちらにも現れなくなる。
   * 1 スナップショットで読むことをここで固定する。
   */
  describe('listWithArchived', () => {
    /** `await ...select(.., { count: 'exact' })` の戻りを模す。 */
    function mockArrayWithCount(data: unknown[], count: number) {
      const mock = createChainableMock(data);
      mock.then = vi
        .fn()
        .mockImplementation((resolve: (v: unknown) => void) =>
          resolve({ data, count, error: null }),
        );
      mockSupabase.from.mockReturnValue(mock);
      return mock;
    }

    const activeParent = {
      id: 'parent-1',
      name: 'Parent',
      user_id: userId,
      parent_id: null,
      sort_order: 0,
      is_active: true,
      archived_at: null,
    };
    const activeChild = {
      ...activeParent,
      id: 'child-1',
      name: 'Child',
      parent_id: 'parent-1',
      sort_order: 0,
    };
    const archivedOld = {
      ...activeParent,
      id: 'archived-old',
      name: 'Old',
      archived_at: '2026-07-01T00:00:00.000Z',
    };
    const archivedNew = {
      ...activeParent,
      id: 'archived-new',
      name: 'New',
      archived_at: '2026-08-01T00:00:00.000Z',
    };

    it('reads active and archived from a single query and keeps hierarchy / recency order', async () => {
      const mockQuery = mockArrayWithCount(
        [archivedOld, activeChild, activeParent, archivedNew],
        4,
      );

      const result = await service.listWithArchived({ userId });

      // 1 テーブル・1 クエリだけを叩く（2 本呼びに戻ると落ちる）。
      expect(mockSupabase.from).toHaveBeenCalledExactlyOnceWith('tags');
      expect(mockQuery.select).toHaveBeenCalledWith('*', { count: 'exact' });
      // マージ済みの墓標はどちらにも混ぜない。
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true);
      // archived_at で絞らない single snapshot なので、分割は TS 側が担う。
      expect(mockQuery.is).not.toHaveBeenCalled();

      expect(result.active.map((tag) => tag.id)).toEqual(['parent-1', 'child-1']);
      expect(result.archived.map((tag) => tag.id)).toEqual(['archived-new', 'archived-old']);
    });

    it('warns when the row limit truncated the read instead of dropping tags silently', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mockArrayWithCount([activeParent], 1001);

      await service.listWithArchived({ userId });

      expect(warn).toHaveBeenCalledWith(
        'Tag read was truncated by the row limit',
        expect.objectContaining({ returned: 1, total: 1001 }),
      );
    });

    it('does not warn when every row was returned', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mockArrayWithCount([activeParent], 1);

      await service.listWithArchived({ userId });

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
