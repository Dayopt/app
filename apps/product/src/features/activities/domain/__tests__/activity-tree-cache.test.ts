import { describe, expect, it } from 'vitest';

import type { Activity, ActivityTree, Category } from '../../types';
import {
  collectActivitiesFromTree,
  collectActivityIdsFromTree,
  removeActivityFromTree,
  removeCategoryFromTree,
  upsertActivityInTree,
  upsertCategoryInTree,
} from '../activity-tree-cache';

function category(id: string, name: string, overrides: Partial<Category> = {}): Category {
  return {
    id,
    name,
    user_id: 'user-1',
    color: 'blue',
    icon: null,
    archived_at: null,
    created_at: '2026-08-18T00:00:00Z',
    updated_at: '2026-08-18T00:00:00Z',
    ...overrides,
  };
}

function activity(
  id: string,
  name: string,
  categoryId: string | null,
  overrides: Partial<Activity> = {},
): Activity {
  return {
    id,
    name,
    user_id: 'user-1',
    category_id: categoryId,
    archived_at: null,
    created_at: '2026-08-18T00:00:00Z',
    updated_at: '2026-08-18T00:00:00Z',
    ...overrides,
  };
}

function tree(): ActivityTree {
  return {
    categories: [
      {
        category: category('cat-work', '仕事'),
        activities: [activity('act-dev', '開発', 'cat-work')],
      },
      { category: category('cat-study', '学習'), activities: [] },
    ],
    uncategorized: [activity('act-run', '運動', null)],
  };
}

describe('upsertActivityInTree', () => {
  it('カテゴリー配下へ名前順で挿入する', () => {
    // 並びの assert は漢字の照合順序に依存しないよう ASCII 名で固定する
    // （実データは日本語だが、ここで凍結したいのは「名前順に入る」ことだけ）
    const source: ActivityTree = {
      categories: [
        {
          category: category('cat-work', 'Work'),
          activities: [activity('act-b', 'Bravo', 'cat-work')],
        },
      ],
      uncategorized: [],
    };
    const next = upsertActivityInTree(source, activity('act-a', 'Alpha', 'cat-work'));

    expect(next?.categories[0]?.activities.map((item) => item.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('category_id が null なら未分類へ入れる', () => {
    const next = upsertActivityInTree(tree(), activity('act-chore', '家事', null));

    expect(next?.uncategorized.map((item) => item.id)).toContain('act-chore');
  });

  it('tree に居ないカテゴリーを指すアクティビティは未分類へ寄せる', () => {
    // カテゴリーのアーカイブは所属アクティビティを道連れにしないため、
    // 「現役アクティビティだが所属カテゴリーは非表示」の行が実在する。
    // ここで拾わないとサイドバーから黙って消える。
    const next = upsertActivityInTree(tree(), activity('act-ghost', '幽霊', 'cat-archived'));

    expect(next?.uncategorized.map((item) => item.id)).toContain('act-ghost');
  });

  it('カテゴリーを移動しても重複しない（元のバケットから外れる）', () => {
    const moved = activity('act-dev', '開発', 'cat-study');
    const next = upsertActivityInTree(tree(), moved);

    expect(next?.categories[0]?.activities).toEqual([]);
    expect(next?.categories[1]?.activities.map((item) => item.id)).toEqual(['act-dev']);
    expect(collectActivityIdsFromTree(next).filter((id) => id === 'act-dev')).toHaveLength(1);
  });

  it('replaceId で一時 ID の行を本物へ差し替える（重複させない）', () => {
    const withTemp = upsertActivityInTree(tree(), activity('temp-1', '新規', 'cat-work'));
    const next = upsertActivityInTree(withTemp, activity('act-new', '新規', 'cat-work'), 'temp-1');

    const ids = collectActivityIdsFromTree(next);
    expect(ids).toContain('act-new');
    expect(ids).not.toContain('temp-1');
    expect(next?.categories[0]?.activities).toHaveLength(2);
  });

  it('アーカイブ済みは一覧へ戻さない', () => {
    const archived = activity('act-dev', '開発', 'cat-work', {
      archived_at: '2026-08-18T01:00:00Z',
    });
    const next = upsertActivityInTree(tree(), archived);

    expect(collectActivityIdsFromTree(next)).not.toContain('act-dev');
  });
});

describe('removeActivityFromTree', () => {
  it('どのバケットに居ても取り除く', () => {
    expect(collectActivityIdsFromTree(removeActivityFromTree(tree(), 'act-dev'))).toEqual([
      'act-run',
    ]);
    expect(collectActivityIdsFromTree(removeActivityFromTree(tree(), 'act-run'))).toEqual([
      'act-dev',
    ]);
  });
});

describe('upsertCategoryInTree', () => {
  it('既存カテゴリーの更新では所属アクティビティを保つ', () => {
    const next = upsertCategoryInTree(tree(), category('cat-work', '仕事', { color: 'red' }));

    expect(next?.categories.find((node) => node.category.id === 'cat-work')?.category.color).toBe(
      'red',
    );
    expect(
      next?.categories.find((node) => node.category.id === 'cat-work')?.activities,
    ).toHaveLength(1);
  });

  it('新規カテゴリーは空のまま名前順に挿入する', () => {
    // 並びの assert は漢字の照合順序に依存しないよう ASCII 名で固定する
    const source: ActivityTree = {
      categories: [{ category: category('cat-a', 'Alpha'), activities: [] }],
      uncategorized: [],
    };
    const next = upsertCategoryInTree(source, category('cat-b', 'Bravo'));

    expect(next?.categories.map((node) => node.category.name)).toEqual(['Alpha', 'Bravo']);
    expect(next?.categories.find((node) => node.category.id === 'cat-b')?.activities).toEqual([]);
  });

  it('アーカイブ済みカテゴリーは見出しごと消え、所属アクティビティは未分類へ移る', () => {
    const next = upsertCategoryInTree(
      tree(),
      category('cat-work', '仕事', { archived_at: '2026-08-18T01:00:00Z' }),
    );

    expect(next?.categories.map((node) => node.category.id)).toEqual(['cat-study']);
    expect(next?.uncategorized.map((item) => item.id).sort()).toEqual(['act-dev', 'act-run']);
  });
});

describe('removeCategoryFromTree', () => {
  it('所属アクティビティを未分類へ移し、連鎖削除しない', () => {
    const next = removeCategoryFromTree(tree(), 'cat-work');

    expect(next?.categories.map((node) => node.category.id)).toEqual(['cat-study']);
    // 並び自体は名前順（漢字の照合順序に依存するので集合として assert する）
    expect(next?.uncategorized.map((item) => item.id).sort()).toEqual(['act-dev', 'act-run']);
  });

  it('存在しないカテゴリーでは何も変えない', () => {
    const source = tree();
    expect(removeCategoryFromTree(source, 'cat-none')).toBe(source);
  });
});

describe('collectActivityIdsFromTree', () => {
  it('カテゴリー ID を含めない（予定・記録はアクティビティしか参照できない）', () => {
    const ids = collectActivityIdsFromTree(tree());

    expect(ids).toEqual(['act-dev', 'act-run']);
    expect(ids).not.toContain('cat-work');
  });
});

describe('collectActivitiesFromTree', () => {
  it('カテゴリー配下と未分類の両方を返す', () => {
    expect(collectActivitiesFromTree(tree()).map((item) => item.id)).toEqual([
      'act-dev',
      'act-run',
    ]);
  });
});
