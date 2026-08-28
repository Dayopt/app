import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';
import { ActivitiesQueryService } from './activities-query-service';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACTIVE_CATEGORY_ID = '00000000-0000-4000-8000-0000000000c1';
const ARCHIVED_CATEGORY_ID = '00000000-0000-4000-8000-0000000000c2';

function category(id: string, name: string) {
  return {
    id,
    user_id: USER_ID,
    name,
    color: null,
    icon: null,
    archived_at: null,
    created_at: '2026-08-18T00:00:00Z',
    updated_at: '2026-08-18T00:00:00Z',
  };
}

function activity(id: string, name: string, categoryId: string | null) {
  return {
    id,
    user_id: USER_ID,
    category_id: categoryId,
    name,
    archived_at: null,
    created_at: '2026-08-18T00:00:00Z',
    updated_at: '2026-08-18T00:00:00Z',
  };
}

describe('ActivitiesQueryService.listTree', () => {
  const mockFrom = vi.fn();
  const supabase = { from: mockFrom } as unknown as SupabaseClient<Database>;
  const service = new ActivitiesQueryService(supabase);

  beforeEach(() => {
    mockFrom.mockReset();
  });

  function mockTree(categories: unknown[], activities: unknown[]) {
    mockFrom.mockImplementation((table: string) =>
      createChainableMock(table === 'categories' ? categories : activities),
    );
  }

  it('groups activities under their category and collects the uncategorized ones', async () => {
    mockTree(
      [category(ACTIVE_CATEGORY_ID, '仕事')],
      [activity('a1', 'レビュー', ACTIVE_CATEGORY_ID), activity('a2', '雑務', null)],
    );

    const tree = await service.listTree({ userId: USER_ID });

    expect(tree.categories).toHaveLength(1);
    expect(tree.categories[0]?.activities.map((a) => a.name)).toEqual(['レビュー']);
    expect(tree.uncategorized.map((a) => a.name)).toEqual(['雑務']);
  });

  /**
   * カテゴリーのアーカイブは所属アクティビティを道連れにしないため、
   * 「現役アクティビティ + アーカイブ済みカテゴリー」の行が実際に発生する。
   * 見出しが出ない以上どのカテゴリー配下にも置けないので未分類へ寄せる。
   * ここを落とすとサイドバーから黙って消える（予定・記録には残ったまま）。
   */
  it('shows an active activity as uncategorized when its category is archived', async () => {
    mockTree(
      // archived なカテゴリーは categories 側のクエリに乗ってこない
      [category(ACTIVE_CATEGORY_ID, '仕事')],
      [
        activity('a1', 'レビュー', ACTIVE_CATEGORY_ID),
        activity('a2', '生きてる作業', ARCHIVED_CATEGORY_ID),
      ],
    );

    const tree = await service.listTree({ userId: USER_ID });

    expect(tree.uncategorized.map((a) => a.name)).toEqual(['生きてる作業']);
    expect(tree.categories[0]?.activities.map((a) => a.name)).toEqual(['レビュー']);
  });

  it('returns an empty bucket for a category with no activities', async () => {
    mockTree([category(ACTIVE_CATEGORY_ID, '仕事')], []);

    const tree = await service.listTree({ userId: USER_ID });

    expect(tree.categories[0]?.activities).toEqual([]);
    expect(tree.uncategorized).toEqual([]);
  });
});
