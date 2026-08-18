import { describe, expect, it } from 'vitest';

import type { Tag, TagTreeNode } from '@/features/tags';

import { partitionActivityTree } from '../activity-tree';

function tag(id: string, name: string, overrides: Partial<Tag> = {}): Tag {
  return {
    id,
    name,
    color: null,
    icon: null,
    parent_id: null,
    ...overrides,
  } as Tag;
}

function node(t: Tag, children: Tag[] = []): TagTreeNode {
  return { tag: t, children } as TagTreeNode;
}

describe('partitionActivityTree', () => {
  it('子を持つノードはカテゴリー、その子はアクティビティになる', () => {
    const work = tag('cat-work', '仕事');
    const meeting = tag('act-meeting', '会議', { parent_id: 'cat-work' });
    const coding = tag('act-coding', '実装', { parent_id: 'cat-work' });

    const result = partitionActivityTree([node(work, [meeting, coding])]);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]?.category.id).toBe('cat-work');
    expect(result.categories[0]?.activities.map((a) => a.id)).toEqual([
      'act-meeting',
      'act-coding',
    ]);
    expect(result.uncategorizedActivities).toHaveLength(0);
  });

  it('子を持たないルートノードは未分類アクティビティになる', () => {
    const solo = tag('act-solo', '散歩');

    const result = partitionActivityTree([node(solo)]);

    expect(result.categories).toHaveLength(0);
    expect(result.uncategorizedActivities.map((a) => a.id)).toEqual(['act-solo']);
  });

  it('カテゴリーもアクティビティも名前順に並ぶ（sort_order 廃止の帰結）', () => {
    const zebra = tag('cat-z', 'ゼブラ');
    const alpha = tag('cat-a', 'アルファ');

    const result = partitionActivityTree([
      node(zebra, [tag('z-2', 'にんじん'), tag('z-1', 'あんず')]),
      node(alpha, [tag('a-1', 'りんご')]),
      node(tag('u-2', 'ぶどう')),
      node(tag('u-1', 'いちご')),
    ]);

    expect(result.categories.map((c) => c.category.id)).toEqual(['cat-a', 'cat-z']);
    expect(result.categories[1]?.activities.map((a) => a.id)).toEqual(['z-1', 'z-2']);
    expect(result.uncategorizedActivities.map((a) => a.id)).toEqual(['u-1', 'u-2']);
  });

  it('allFilterableIds はカテゴリー所属と未分類の両方のアクティビティを含む', () => {
    const result = partitionActivityTree([
      node(tag('cat-1', 'A'), [tag('act-1', 'x'), tag('act-2', 'y')]),
      node(tag('act-3', 'z')),
    ]);

    expect(result.allFilterableIds).toEqual(expect.arrayContaining(['act-1', 'act-2', 'act-3']));
  });

  // 回帰防止: カテゴリー ID を除外すると、カテゴリーを直接参照しているブロックが
  // syncWithActivities の orphan 除去で visibleActivityIds から消え、カレンダーから
  // 見えなくなる。サイドバーにカテゴリー自身の表示トグルが無いため復帰手段も無い。
  // useCalendarData 側の sync は全タグ ID を渡すため、集合を揃えないと後から走った
  // 方が相手の ID を orphan 除去してしまう（旧実装は flattenTagTree で親を含めていた）。
  it('allFilterableIds はカテゴリー ID も含む（ブロックがカテゴリーを直接参照しうるため）', () => {
    const result = partitionActivityTree([
      node(tag('cat-1', 'A'), [tag('act-1', 'x')]),
      node(tag('cat-2', 'B'), [tag('act-2', 'y')]),
      node(tag('act-3', 'z')),
    ]);

    expect(result.allFilterableIds).toContain('cat-1');
    expect(result.allFilterableIds).toContain('cat-2');
    // 旧実装（flattenTagTree）と同じく、親 + 子 + 葉の全 ID が揃う
    expect([...result.allFilterableIds].sort()).toEqual([
      'act-1',
      'act-2',
      'act-3',
      'cat-1',
      'cat-2',
    ]);
  });

  it('空配列でも壊れない', () => {
    const result = partitionActivityTree([]);

    expect(result.categories).toEqual([]);
    expect(result.uncategorizedActivities).toEqual([]);
    expect(result.allFilterableIds).toEqual([]);
    expect(result.allActivities).toEqual([]);
  });
});
