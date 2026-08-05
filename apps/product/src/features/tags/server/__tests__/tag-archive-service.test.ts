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

  /**
   * 復元は「名前衝突 preflight → 子 → 親」の順に走る（#1826）。
   *
   * 親を先に復元すると、その archived_at が消えた時点で「同じアーカイブ操作で
   * 道連れになった子」を引く手がかりが失われ、途中で失敗した時にリトライしても
   * 残りの子を永久に復元できなくなる。
   */
  describe('restore', () => {
    /** 復元後の名前が空いている（衝突なし）ことを返す preflight mock。 */
    const noNameConflict = () => createChainableMock(null);

    it('should restore an archived root tag with its batch-archived children', async () => {
      const nameConflictMock = noNameConflict();
      const childrenSelectMock = createChainableMock([{ id: 'child-1' }, { id: 'child-2' }]);
      const child1UpdateMock = createChainableMock(null);
      const child2UpdateMock = createChainableMock(null);
      const restoreUpdateMock = createChainableMock(null);

      // 1: getById → archived root, 2: 名前衝突 preflight, 3: children select（同一 archived_at）,
      // 4-5: per-child restore update（単一 UPDATE だと 1 件の衝突で全滅するため 1 件ずつ実行する）,
      // 6: 親の restore update（子より後）
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(nameConflictMock)
        .mockReturnValueOnce(childrenSelectMock)
        .mockReturnValueOnce(child1UpdateMock)
        .mockReturnValueOnce(child2UpdateMock)
        .mockReturnValueOnce(restoreUpdateMock);

      const result = await service.restore({ userId, tagId: 'tag-1' });

      expect(restoreUpdateMock.update).toHaveBeenCalledWith({
        archived_at: null,
        parent_id: null,
      });
      expect(childrenSelectMock.select).toHaveBeenCalledWith('id');
      expect(childrenSelectMock.eq).toHaveBeenCalledWith('archived_at', ARCHIVED_AT);
      // 子には archived_at だけを書く。parent_id を触ると check_tag_has_children が
      // 発火し、この時点でまだアーカイブ中の親から子が切り離される。
      expect(child1UpdateMock.update).toHaveBeenCalledWith({ archived_at: null });
      expect(child1UpdateMock.eq).toHaveBeenCalledWith('id', 'child-1');
      expect(child2UpdateMock.update).toHaveBeenCalledWith({ archived_at: null });
      expect(child2UpdateMock.eq).toHaveBeenCalledWith('id', 'child-2');
      // 想定外の往復（子ごとに restore を再帰呼びする実装への書き換え等）を検出する。
      expect(mockSupabase.from).toHaveBeenCalledTimes(6);
      expect(result.tag.archived_at).toBeNull();
      expect(result.restoredChildCount).toBe(2);
      expect(result.conflictedChildCount).toBe(0);
    });

    it('should skip a child on 23505 conflict and keep restoring the rest without throwing', async () => {
      const childrenSelectMock = createChainableMock([{ id: 'child-1' }, { id: 'child-2' }]);
      const child1UpdateMock = createChainableMock(null, {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      });
      const child2UpdateMock = createChainableMock(null);
      const restoreUpdateMock = createChainableMock(null);

      // child-1 は同名衝突でスキップし、child-2 は正常に復元する。statement 全体は失敗しない
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(noNameConflict())
        .mockReturnValueOnce(childrenSelectMock)
        .mockReturnValueOnce(child1UpdateMock)
        .mockReturnValueOnce(child2UpdateMock)
        .mockReturnValueOnce(restoreUpdateMock);

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
      // 3: getNextSortOrder, 4: 名前衝突 preflight, 5: restore update
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(childTag))
        .mockReturnValueOnce(createChainableMock(null))
        .mockReturnValueOnce(mockArrayResponse([{ sort_order: 2 }]))
        .mockReturnValueOnce(noNameConflict())
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

    it('should throw DUPLICATE_NAME before touching any child', async () => {
      const nameConflictMock = createChainableMock({ id: 'existing-tag' });

      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(nameConflictMock);

      await expect(service.restore({ userId, tagId: 'tag-1' })).rejects.toMatchObject({
        code: 'DUPLICATE_NAME',
      });

      // 通常フローの衝突（アーカイブ中に同名タグを作れる）では、子を 1 件も
      // 復元しないまま返す。ここで書き込むと「子だけ復元済み」が可視化される。
      expect(mockSupabase.from).toHaveBeenCalledTimes(2);
      expect(nameConflictMock.update).not.toHaveBeenCalled();
    });

    it('still reports DUPLICATE_NAME when the name is taken after the preflight passed', async () => {
      const childrenSelectMock = createChainableMock([{ id: 'child-1' }]);
      const child1UpdateMock = createChainableMock(null);
      const restoreUpdateMock = createChainableMock(null, {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      });

      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(noNameConflict())
        .mockReturnValueOnce(childrenSelectMock)
        .mockReturnValueOnce(child1UpdateMock)
        .mockReturnValueOnce(restoreUpdateMock);

      await expect(service.restore({ userId, tagId: 'tag-1' })).rejects.toMatchObject({
        code: 'DUPLICATE_NAME',
      });
    });

    it('resumes only the unrestored children when a retry follows a failed parent update', async () => {
      // 1 回目: 子は復元済み・親 UPDATE が落ちる。親は archived_at を保持したまま。
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(noNameConflict())
        .mockReturnValueOnce(createChainableMock([{ id: 'child-1' }]))
        .mockReturnValueOnce(createChainableMock(null))
        .mockReturnValueOnce(
          createChainableMock(null, { message: 'connection reset', code: '08006' }),
        );

      await expect(service.restore({ userId, tagId: 'tag-1' })).rejects.toMatchObject({
        code: 'UPDATE_FAILED',
      });

      // 2 回目: 親はまだ archived なので冒頭の早期 return を通過できる。
      // 復元済みの子は archived_at = ARCHIVED_AT の select から自然に外れるため、
      // 残り（ここでは 0 件）だけを拾って親を復元し、収束する。
      const retryChildrenSelectMock = createChainableMock([]);
      const retryRestoreUpdateMock = createChainableMock(null);
      mockSupabase.from
        .mockReturnValueOnce(mockSingleResponse(makeTag({ archived_at: ARCHIVED_AT })))
        .mockReturnValueOnce(noNameConflict())
        .mockReturnValueOnce(retryChildrenSelectMock)
        .mockReturnValueOnce(retryRestoreUpdateMock);

      const result = await service.restore({ userId, tagId: 'tag-1' });

      expect(retryChildrenSelectMock.eq).toHaveBeenCalledWith('archived_at', ARCHIVED_AT);
      expect(retryRestoreUpdateMock.update).toHaveBeenCalledWith({
        archived_at: null,
        parent_id: null,
      });
      expect(result.tag.archived_at).toBeNull();
      expect(result.restoredChildCount).toBe(0);
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
