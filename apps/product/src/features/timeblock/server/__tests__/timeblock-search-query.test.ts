import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `buildTimeblockSearchFilter` の分類名検索が **アクティビティ名一致のみ**である
 * ことを凍結する（#2162、Step 8 tag_id 剥離 で tags 名前検索を除去）。
 *
 * tags 名前検索の除去は書き込み経路からの tag_id 参照除去に伴う唯一のユーザー可視劣化
 * （note に含まれない旧タグ名での検索が消える）。issue #2162 のコメント欄
 * overview.md §Step 8（tag_id 剥離）の設計 相当の表を参照（#2473 で移設）。
 */

const runPrivateTimeblockSearchQuery = vi.hoisted(() => vi.fn());
vi.mock('../private-timeblock-search-query', () => ({ runPrivateTimeblockSearchQuery }));

import { buildTimeblockSearchFilter } from '../timeblock-search-query';

/** `.from(table)` だけ見分けられれば十分な最小 stub */
function createSupabase(byTable: Record<string, Array<{ id: string }>>) {
  const seen: string[] = [];
  const supabase = {
    from(table: string) {
      seen.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        ilike: () => ({ data: byTable[table] ?? [], error: null }),
      };
      return builder;
    },
  };
  return { supabase, seen };
}

function buildWith(byTable: Record<string, Array<{ id: string }>>, search = 'design') {
  const { supabase, seen } = createSupabase(byTable);
  return {
    seen,
    result: buildTimeblockSearchFilter({
      // 実クライアントの型は広いが、この関数が使うのは from(...) の chain だけ
      supabase: supabase as never,
      userId: 'user-1',
      search,
    }),
  };
}

describe('buildTimeblockSearchFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 実装は query を private wrapper 経由で await する。ここでは素通しする
    runPrivateTimeblockSearchQuery.mockImplementation(async (operation: () => unknown) =>
      operation(),
    );
  });

  it('アクティビティ名の一致を activity_id フィルタへ載せる', async () => {
    const { result } = buildWith({ activities: [{ id: 'act-1' }, { id: 'act-2' }] });

    await expect(result).resolves.toBe('note.ilike.%design%,activity_id.in.(act-1,act-2)');
  });

  it('アクティビティが一致しなければ note だけで引く', async () => {
    const { result } = buildWith({});

    await expect(result).resolves.toBe('note.ilike.%design%');
  });

  it('activities だけを引く（tags へは問い合わせない）', async () => {
    const { seen, result } = buildWith({});
    await result;

    expect(seen).toEqual(['activities']);
  });

  it('記号だけの入力は無条件一覧へフォールバックしない', async () => {
    const { result } = buildWith({ activities: [{ id: 'act-1' }] }, '(),.*');

    await expect(result).resolves.toBe('id.is.null');
  });

  it('分類クエリが失敗したら検索語を含めずに FETCH_FAILED を投げる', async () => {
    runPrivateTimeblockSearchQuery.mockResolvedValueOnce({ data: null, error: new Error('boom') });

    const { result } = buildWith({}, 'secret-words');

    await expect(result).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to search timeblock classifications',
    });
    await expect(result.catch((e: Error) => e.message)).resolves.not.toContain('secret-words');
  });
});
