/**
 * TagArchiveService Unit Tests — アーカイブ / 復元（#1576）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import { createTagService, TagService } from '../tag-service';
import { mockArrayResponse, mockSingleResponse } from './tag-service-test-helpers';

const ARCHIVED_AT = '2026-08-01T00:00:00.000Z';

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    name: 'Work',
    user_id: 'test-user-id',
    color: 'blue',
    icon: null,
    is_active: true,
    archived_at: null,
    parent_id: null,
    sort_order: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('TagArchiveService', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: TagService;
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    service = createTagService(mockSupabase as unknown as Parameters<typeof createTagService>[0]);
  });

  describe('archive', () => {
    it('should archive the tag and report archived child count', async () => {
      const archiveUpdateMock = createChainableMock([{ id: 'tag-1' }, { id: 'child-1' }]);

      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag()))
        .mockReturnValueOnce(archiveUpdateMock);

      const result = await service.archive({ userId, tagId: 'tag-1' });

      expect(archiveUpdateMock.update).toHaveBeenCalledWith({
        archived_at: expect.any(String),
      });
      expect(result.tag.archived_at).toEqual(expect.any(String));
      expect(result.archivedChildCount).toBe(1);
    });

    it('should be idempotent for already archived tags', async () => {
      mockSupabase.from.mockReturnValueOnce(
        mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })),
      );

      const result = await service.archive({ userId, tagId: 'tag-1' });

      expect(result.tag.archived_at).toBe(ARCHIVED_AT);
      expect(result.archivedChildCount).toBe(0);
      // update 経路が呼ばれない（from は getById の 1 回のみ）
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('restore', () => {
    it('should restore an archived root tag with its batch-archived children', async () => {
      const restoreUpdateMock = createChainableMock(null);
      const childrenSelectMock = createChainableMock([{ id: 'child-1' }, { id: 'child-2' }]);
      const child1UpdateMock = createChainableMock(null);
      const child2UpdateMock = createChainableMock(null);

      // 1: getById → archived root, 2: restore update, 3: children select（同一 archived_at）,
      // 4-5: per-child restore update（単一 UPDATE だと 1 件の衝突で全滅するため 1 件ずつ実行する）
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(restoreUpdateMock)
        .mockReturnValueOnce(childrenSelectMock)
        .mockReturnValueOnce(child1UpdateMock)
        .mockReturnValueOnce(child2UpdateMock);

      const result = await service.restore({ userId, tagId: 'tag-1' });

      expect(restoreUpdateMock.update).toHaveBeenCalledWith({
        archived_at: null,
        parent_id: null,
      });
      expect(childrenSelectMock.select).toHaveBeenCalledWith('id');
      expect(childrenSelectMock.eq).toHaveBeenCalledWith('archived_at', ARCHIVED_AT);
      expect(child1UpdateMock.update).toHaveBeenCalledWith({ archived_at: null });
      expect(child1UpdateMock.eq).toHaveBeenCalledWith('id', 'child-1');
      expect(child2UpdateMock.update).toHaveBeenCalledWith({ archived_at: null });
      expect(child2UpdateMock.eq).toHaveBeenCalledWith('id', 'child-2');
      expect(result.tag.archived_at).toBeNull();
      expect(result.restoredChildCount).toBe(2);
      expect(result.conflictedChildCount).toBe(0);
    });

    it('should skip a child on 23505 conflict and keep restoring the rest without throwing', async () => {
      const restoreUpdateMock = createChainableMock(null);
      const childrenSelectMock = createChainableMock([{ id: 'child-1' }, { id: 'child-2' }]);
      const child1UpdateMock = createChainableMock(null, {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      });
      const child2UpdateMock = createChainableMock(null);

      // child-1 は同名衝突でスキップし、child-2 は正常に復元する。statement 全体は失敗しない
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(restoreUpdateMock)
        .mockReturnValueOnce(childrenSelectMock)
        .mockReturnValueOnce(child1UpdateMock)
        .mockReturnValueOnce(child2UpdateMock);

      const result = await service.restore({ userId, tagId: 'tag-1' });

      expect(result.tag.archived_at).toBeNull();
      expect(result.restoredChildCount).toBe(1);
      expect(result.conflictedChildCount).toBe(1);
    });

    it('should restore a child as root when its parent is archived', async () => {
      const childTag = makeTag({
        id: 'child-1',
        name: 'Child',
        parent_id: 'parent-1',
        archived_at: ARCHIVED_AT,
      });
      const restoreUpdateMock = createChainableMock(null);

      // 1: getById → archived child, 2: parent lookup（アーカイブ中 → 0 件）,
      // 3: getNextSortOrder, 4: restore update
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(childTag))
        .mockReturnValueOnce(createChainableMock(null))
        .mockReturnValueOnce(mockArrayResponse([{ sort_order: 2 }]))
        .mockReturnValueOnce(restoreUpdateMock);

      const result = await service.restore({ userId, tagId: 'child-1' });

      expect(restoreUpdateMock.update).toHaveBeenCalledWith({
        archived_at: null,
        parent_id: null,
        sort_order: 3,
      });
      // 子タグの個別復元では兄弟の巻き戻しをしない
      expect(result.restoredChildCount).toBe(0);
      expect(result.conflictedChildCount).toBe(0);
      expect(result.tag.parent_id).toBeNull();
    });

    it('should throw DUPLICATE_NAME when a same-named tag already exists', async () => {
      const restoreUpdateMock = createChainableMock(null, {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      });

      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(restoreUpdateMock);

      await expect(service.restore({ userId, tagId: 'tag-1' })).rejects.toMatchObject({
        code: 'DUPLICATE_NAME',
      });
    });

    it('should be idempotent for non-archived tags', async () => {
      mockSupabase.from.mockReturnValueOnce(mockSingleResponse(makeTag()));

      const result = await service.restore({ userId, tagId: 'tag-1' });

      expect(result.tag.archived_at).toBeNull();
      expect(result.restoredChildCount).toBe(0);
      expect(result.conflictedChildCount).toBe(0);
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });
  });
});
