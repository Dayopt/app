import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Tag, TagTreeNode } from '../../types';

type DeleteMutationOptions = {
  onSettled?: (data: unknown, err: unknown, input: { id: string }) => void;
};

const mocks = vi.hoisted(() => ({
  listInvalidate: vi.fn(),
  listHierarchyInvalidate: vi.fn(),
  listArchivedInvalidate: vi.fn(),
  getByIdInvalidate: vi.fn(),
  plansListInvalidate: vi.fn(),
  recordsListInvalidate: vi.fn(),
  tagStatsInvalidate: vi.fn(),
  deleteMutationOptions: undefined as DeleteMutationOptions | undefined,
}));

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      tags: {
        list: {
          invalidate: mocks.listInvalidate,
          getData: vi.fn(),
          setData: vi.fn(),
          cancel: vi.fn(),
        },
        listHierarchy: { invalidate: mocks.listHierarchyInvalidate },
        listArchived: { invalidate: mocks.listArchivedInvalidate },
        getById: {
          invalidate: mocks.getByIdInvalidate,
          getData: vi.fn(),
          setData: vi.fn(),
          cancel: vi.fn(),
        },
      },
      plans: { list: { invalidate: mocks.plansListInvalidate } },
      records: { list: { invalidate: mocks.recordsListInvalidate } },
      statistics: { getTagStats: { invalidate: mocks.tagStatsInvalidate } },
    }),
    tags: {
      delete: {
        useMutation: (options: DeleteMutationOptions) => {
          mocks.deleteMutationOptions = options;
          return { mutate: vi.fn(), mutateAsync: vi.fn() };
        },
      },
    },
  },
}));

import {
  upsertTagInHierarchyCache,
  upsertTagInListCache,
  useDeleteTag,
} from '../useTagCrudMutations';

function makeTag(overrides: Partial<Tag>): Tag {
  return {
    id: 'tag-1',
    name: 'Tag',
    color: 'gray',
    icon: null,
    parent_id: null,
    sort_order: 0,
    is_active: true,
    archived_at: null,
    user_id: 'user-1',
    created_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('useTagCrudMutations cache helpers', () => {
  it('新規作成した小タグをフラット一覧に追加する', () => {
    const parent = makeTag({ id: 'parent', name: 'dev', sort_order: 0 });
    const child = makeTag({
      id: 'child',
      name: 'api',
      parent_id: 'parent',
      sort_order: 0,
    });

    const result = upsertTagInListCache({ data: [parent], count: 1 }, child);

    expect(result.data.map((tag) => tag.id)).toEqual(['child', 'parent']);
    expect(result.count).toBe(2);
  });

  it('仮小タグを確定小タグに置き換えて階層内に残す', () => {
    const parent = makeTag({ id: 'parent', name: 'dev', sort_order: 0 });
    const tempChild = makeTag({
      id: 'temp-child',
      name: 'api',
      parent_id: 'parent',
      sort_order: 0,
    });
    const savedChild = makeTag({
      id: 'child',
      name: 'api',
      parent_id: 'parent',
      sort_order: 0,
    });
    const hierarchy: TagTreeNode[] = [{ tag: parent, children: [tempChild] }];

    const result = upsertTagInHierarchyCache(hierarchy, savedChild, 'temp-child');

    expect(result).toHaveLength(1);
    expect(result[0]?.tag.id).toBe('parent');
    expect(result[0]?.children.map((tag) => tag.id)).toEqual(['child']);
    expect(result[0]?.children[0]?.name).toBe('api');
  });
});

describe('useDeleteTag onSettled', () => {
  it('tags.listArchived を invalidate する（アーカイブ一覧からの削除が反映されるため、#1576）', () => {
    renderHook(() => useDeleteTag());

    expect(mocks.deleteMutationOptions?.onSettled).toBeDefined();
    mocks.deleteMutationOptions?.onSettled?.(undefined, null, { id: 'tag-1' });

    expect(mocks.listArchivedInvalidate).toHaveBeenCalledTimes(1);
    // 既存の invalidate 対象も回帰していないことを併せて確認する
    expect(mocks.listInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.listHierarchyInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.getByIdInvalidate).toHaveBeenCalledWith({ id: 'tag-1' });
    expect(mocks.plansListInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.recordsListInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.tagStatsInvalidate).toHaveBeenCalledTimes(1);
  });
});
