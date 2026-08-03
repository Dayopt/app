import { describe, expect, it } from 'vitest';

import type { Tag, TagTreeNode } from '../../types';

import { upsertTagInHierarchyCache, upsertTagInListCache } from '../useTagCrudMutations';

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
