import { describe, expect, it } from 'vitest';

import type { Tag, TagTreeNode } from '@/features/tags';

import {
  END_OF_ROOT,
  ROOT,
  canBecomeChild,
  childContainerId,
  findTreeTag,
  moveTagTree,
} from '../move-tag-tree';

function makeTag(overrides: Partial<Tag> & { id: string }): Tag {
  return {
    user_id: 'user-1',
    name: overrides.id,
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

function makeNode(id: string, childIds: string[] = []): TagTreeNode {
  return {
    tag: makeTag({ id }),
    children: childIds.map((cid) => makeTag({ id: cid, parent_id: id })),
  };
}

function snapshot(nodes: TagTreeNode[]): { id: string; parent: string | null }[] {
  const out: { id: string; parent: string | null }[] = [];
  for (const node of nodes) {
    out.push({ id: node.tag.id, parent: null });
    for (const child of node.children) {
      out.push({ id: child.id, parent: node.tag.id });
    }
  }
  return out;
}

describe('moveTagTree — invalid drops return null', () => {
  it('active === over の no-op drop（source 上での release）は null', () => {
    const nodes = [makeNode('r1'), makeNode('r2'), makeNode('r3')];
    expect(moveTagTree(nodes, 'r1', 'r1')).toBeNull();
  });

  it('child の active === over も null（同 parent 内末尾への silent 移動を防ぐ）', () => {
    const nodes = [makeNode('r1', ['c1', 'c2'])];
    expect(moveTagTree(nodes, 'c1', 'c1')).toBeNull();
  });

  it('active が tree に存在しない場合は null', () => {
    const nodes = [makeNode('r1'), makeNode('r2')];
    expect(moveTagTree(nodes, 'missing', 'r1')).toBeNull();
  });

  it('over container が解決できない場合は null', () => {
    const nodes = [makeNode('r1')];
    expect(moveTagTree(nodes, 'r1', 'unknown-id')).toBeNull();
  });

  it('children を持つ root を別 root の child にしようとすると null（depth=1 制約）', () => {
    const nodes = [makeNode('r1', ['c1']), makeNode('r2')];
    // r1 を r2 の children container へ
    expect(moveTagTree(nodes, 'r1', childContainerId('r2'))).toBeNull();
  });

  it('active 自身を own children container の親として指定すると null', () => {
    const nodes = [makeNode('r1', ['c1'])];
    expect(moveTagTree(nodes, 'r1', childContainerId('r1'))).toBeNull();
  });
});

describe('moveTagTree — root reorder', () => {
  it('root を root 上に drop すると drop 先の手前に挿入される', () => {
    const nodes = [makeNode('r1'), makeNode('r2'), makeNode('r3')];
    const next = moveTagTree(nodes, 'r3', 'r1');
    expect(next).not.toBeNull();
    expect(snapshot(next!).map((s) => s.id)).toEqual(['r3', 'r1', 'r2']);
  });

  it('root を ROOT container 上に drop すると末尾に移動', () => {
    const nodes = [makeNode('r1'), makeNode('r2'), makeNode('r3')];
    const next = moveTagTree(nodes, 'r1', ROOT);
    expect(next).not.toBeNull();
    expect(snapshot(next!).map((s) => s.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('END_OF_ROOT zone に drop すると ROOT 末尾に挿入される', () => {
    const nodes = [makeNode('r1', ['c1', 'c2']), makeNode('r2'), makeNode('r3')];
    // expanded parent r1 を end zone に drop
    const next = moveTagTree(nodes, 'r1', END_OF_ROOT);
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r2', parent: null },
      { id: 'r3', parent: null },
      { id: 'r1', parent: null },
      { id: 'c1', parent: 'r1' },
      { id: 'c2', parent: 'r1' },
    ]);
  });

  it('child を END_OF_ROOT に drop すると root 末尾に昇格する', () => {
    const nodes = [makeNode('r1', ['c1', 'c2']), makeNode('r2')];
    const next = moveTagTree(nodes, 'c1', END_OF_ROOT);
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r1', parent: null },
      { id: 'c2', parent: 'r1' },
      { id: 'r2', parent: null },
      { id: 'c1', parent: null },
    ]);
  });

  it('root reorder 後も children は保持される', () => {
    const nodes = [makeNode('r1', ['c1', 'c2']), makeNode('r2')];
    const next = moveTagTree(nodes, 'r2', 'r1');
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r2', parent: null },
      { id: 'r1', parent: null },
      { id: 'c1', parent: 'r1' },
      { id: 'c2', parent: 'r1' },
    ]);
  });
});

describe('moveTagTree — child reorder', () => {
  it('同一 parent 内の child を別 child の手前に移動', () => {
    const nodes = [makeNode('r1', ['c1', 'c2', 'c3'])];
    const next = moveTagTree(nodes, 'c3', 'c1');
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r1', parent: null },
      { id: 'c3', parent: 'r1' },
      { id: 'c1', parent: 'r1' },
      { id: 'c2', parent: 'r1' },
    ]);
  });

  it('child を別 parent の children container 上に drop すると末尾に挿入', () => {
    const nodes = [makeNode('r1', ['c1', 'c2']), makeNode('r2', ['c3'])];
    const next = moveTagTree(nodes, 'c1', childContainerId('r2'));
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r1', parent: null },
      { id: 'c2', parent: 'r1' },
      { id: 'r2', parent: null },
      { id: 'c3', parent: 'r2' },
      { id: 'c1', parent: 'r2' },
    ]);
  });

  it('child を別 parent の child 上に drop するとその手前に挿入', () => {
    const nodes = [makeNode('r1', ['c1']), makeNode('r2', ['c2', 'c3'])];
    const next = moveTagTree(nodes, 'c1', 'c3');
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r1', parent: null },
      { id: 'r2', parent: null },
      { id: 'c2', parent: 'r2' },
      { id: 'c1', parent: 'r2' },
      { id: 'c3', parent: 'r2' },
    ]);
    // 移動した tag の parent_id が更新されている
    expect(next![1]!.children[1]!.parent_id).toBe('r2');
  });

  it('child を ROOT 上に drop すると root 末尾に昇格し parent_id=null', () => {
    const nodes = [makeNode('r1', ['c1', 'c2'])];
    const next = moveTagTree(nodes, 'c1', ROOT);
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r1', parent: null },
      { id: 'c2', parent: 'r1' },
      { id: 'c1', parent: null },
    ]);
    expect(next![1]!.tag.parent_id).toBe(null);
  });

  it('child を別 root 行に drop するとその手前に root として挿入される', () => {
    const nodes = [makeNode('r1', ['c1']), makeNode('r2'), makeNode('r3')];
    const next = moveTagTree(nodes, 'c1', 'r3');
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r1', parent: null },
      { id: 'r2', parent: null },
      { id: 'c1', parent: null },
      { id: 'r3', parent: null },
    ]);
  });
});

describe('moveTagTree — root → child（childless root のみ許可）', () => {
  it('childless root を別 root の children container に drop すると child になる', () => {
    const nodes = [makeNode('r1'), makeNode('r2', ['c1'])];
    const next = moveTagTree(nodes, 'r1', childContainerId('r2'));
    expect(next).not.toBeNull();
    expect(snapshot(next!)).toEqual([
      { id: 'r2', parent: null },
      { id: 'c1', parent: 'r2' },
      { id: 'r1', parent: 'r2' },
    ]);
  });
});

describe('moveTagTree — input mutation safety', () => {
  it('入力 nodes は破壊的に変更されない（cloneNodes）', () => {
    const nodes = [makeNode('r1', ['c1', 'c2']), makeNode('r2')];
    const before = snapshot(nodes);
    moveTagTree(nodes, 'c1', childContainerId('r2'));
    expect(snapshot(nodes)).toEqual(before);
  });
});

describe('canBecomeChild', () => {
  it('既に child のタグは true', () => {
    const nodes = [makeNode('r1', ['c1'])];
    const tag = findTreeTag(nodes, 'c1')!;
    expect(canBecomeChild(tag)).toBe(true);
  });

  it('children を持たない root は true', () => {
    const nodes = [makeNode('r1')];
    const tag = findTreeTag(nodes, 'r1')!;
    expect(canBecomeChild(tag)).toBe(true);
  });

  it('children を持つ root は false（depth=1 制約）', () => {
    const nodes = [makeNode('r1', ['c1'])];
    const tag = findTreeTag(nodes, 'r1')!;
    expect(canBecomeChild(tag)).toBe(false);
  });
});
