import { describe, expect, it } from 'vitest';

import type { Tag, TagTreeNode } from '../types';

import { buildTagHierarchyUpdates, buildTagTree, flattenTagTree } from './tag-tree';

function makeTag(overrides: Partial<Tag> & { id: string; name: string }): Tag {
  return {
    user_id: 'user-1',
    color: null,
    icon: null,
    is_active: true,
    parent_id: null,
    sort_order: 0,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('buildTagTree', () => {
  it('ソート順は sort_order 優先、同値時は name で安定', () => {
    const tags: Tag[] = [
      makeTag({ id: 'b', name: 'Beta', sort_order: 1 }),
      makeTag({ id: 'a', name: 'Alpha', sort_order: 0 }),
      makeTag({ id: 'c', name: 'Charlie', sort_order: 1 }),
    ];

    const tree = buildTagTree(tags);

    expect(tree.map((node) => node.tag.id)).toEqual(['a', 'b', 'c']);
  });

  it('parent_id を持つタグは親の children に格納される', () => {
    const tags: Tag[] = [
      makeTag({ id: 'root', name: 'Root', sort_order: 0 }),
      makeTag({ id: 'child-2', name: 'B', parent_id: 'root', sort_order: 1 }),
      makeTag({ id: 'child-1', name: 'A', parent_id: 'root', sort_order: 0 }),
    ];

    const tree = buildTagTree(tags);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.tag.id).toBe('root');
    expect(tree[0]!.children.map((c) => c.id)).toEqual(['child-1', 'child-2']);
  });

  it('parent_id が active な tag を指していない場合は root として扱う', () => {
    const tags: Tag[] = [makeTag({ id: 'orphan', name: 'Orphan', parent_id: 'missing-parent' })];

    const tree = buildTagTree(tags);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.tag.id).toBe('orphan');
  });

  it('is_active=false のタグは除外される', () => {
    const tags: Tag[] = [
      makeTag({ id: 'active', name: 'Active', is_active: true }),
      makeTag({ id: 'inactive', name: 'Inactive', is_active: false }),
    ];

    const tree = buildTagTree(tags);

    expect(tree.map((n) => n.tag.id)).toEqual(['active']);
  });

  it('inactive な親を持つ child は root に昇格する', () => {
    const tags: Tag[] = [
      makeTag({ id: 'parent', name: 'Parent', is_active: false }),
      makeTag({ id: 'child', name: 'Child', parent_id: 'parent', is_active: true }),
    ];

    const tree = buildTagTree(tags);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.tag.id).toBe('child');
    expect(tree[0]!.children).toEqual([]);
  });

  it('空配列を渡すと空配列を返す', () => {
    expect(buildTagTree([])).toEqual([]);
  });
});

describe('flattenTagTree', () => {
  it('root → children の順にフラット化する', () => {
    const nodes: TagTreeNode[] = [
      {
        tag: makeTag({ id: 'r1', name: 'R1' }),
        children: [makeTag({ id: 'c1', name: 'C1', parent_id: 'r1' })],
      },
      {
        tag: makeTag({ id: 'r2', name: 'R2' }),
        children: [],
      },
    ];

    expect(flattenTagTree(nodes).map((t) => t.id)).toEqual(['r1', 'c1', 'r2']);
  });

  it('buildTagTree → flattenTagTree のラウンドトリップで全 active タグが残る', () => {
    const tags: Tag[] = [
      makeTag({ id: 'r1', name: 'R1', sort_order: 0 }),
      makeTag({ id: 'r2', name: 'R2', sort_order: 1 }),
      makeTag({ id: 'c1', name: 'C1', parent_id: 'r1', sort_order: 0 }),
    ];

    const flattened = flattenTagTree(buildTagTree(tags));

    expect(flattened.map((t) => t.id).sort()).toEqual(['c1', 'r1', 'r2']);
  });
});

describe('buildTagHierarchyUpdates', () => {
  it('root タグに連番の sort_order と parent_id=null を割り当てる', () => {
    const nodes: TagTreeNode[] = [
      { tag: makeTag({ id: 'r1', name: 'R1' }), children: [] },
      { tag: makeTag({ id: 'r2', name: 'R2' }), children: [] },
      { tag: makeTag({ id: 'r3', name: 'R3' }), children: [] },
    ];

    const updates = buildTagHierarchyUpdates(nodes);

    expect(updates).toEqual([
      { id: 'r1', parent_id: null, sort_order: 0 },
      { id: 'r2', parent_id: null, sort_order: 1 },
      { id: 'r3', parent_id: null, sort_order: 2 },
    ]);
  });

  it('children に親 id と連番の sort_order を割り当てる', () => {
    const nodes: TagTreeNode[] = [
      {
        tag: makeTag({ id: 'r1', name: 'R1' }),
        children: [
          makeTag({ id: 'c1', name: 'C1', parent_id: 'r1' }),
          makeTag({ id: 'c2', name: 'C2', parent_id: 'r1' }),
        ],
      },
    ];

    const updates = buildTagHierarchyUpdates(nodes);

    expect(updates).toEqual([
      { id: 'r1', parent_id: null, sort_order: 0 },
      { id: 'c1', parent_id: 'r1', sort_order: 0 },
      { id: 'c2', parent_id: 'r1', sort_order: 1 },
    ]);
  });

  it('child を別の root に移動した場合、新しい parent_id が反映される', () => {
    // c1 を r1 から r2 配下へ移動した状態
    const nodes: TagTreeNode[] = [
      { tag: makeTag({ id: 'r1', name: 'R1' }), children: [] },
      {
        tag: makeTag({ id: 'r2', name: 'R2' }),
        children: [makeTag({ id: 'c1', name: 'C1', parent_id: 'r1' })],
      },
    ];

    const updates = buildTagHierarchyUpdates(nodes);

    const c1Update = updates.find((u) => u.id === 'c1');
    expect(c1Update).toEqual({ id: 'c1', parent_id: 'r2', sort_order: 0 });
  });

  it('root の並び替え後は新しい順に sort_order が振り直される', () => {
    // 元: r1=0, r2=1, r3=2 → ユーザーが r3 を先頭に移動
    const nodes: TagTreeNode[] = [
      { tag: makeTag({ id: 'r3', name: 'R3', sort_order: 2 }), children: [] },
      { tag: makeTag({ id: 'r1', name: 'R1', sort_order: 0 }), children: [] },
      { tag: makeTag({ id: 'r2', name: 'R2', sort_order: 1 }), children: [] },
    ];

    const updates = buildTagHierarchyUpdates(nodes);

    expect(updates.map((u) => ({ id: u.id, sort_order: u.sort_order }))).toEqual([
      { id: 'r3', sort_order: 0 },
      { id: 'r1', sort_order: 1 },
      { id: 'r2', sort_order: 2 },
    ]);
  });

  it('空配列を渡すと空配列を返す', () => {
    expect(buildTagHierarchyUpdates([])).toEqual([]);
  });
});
