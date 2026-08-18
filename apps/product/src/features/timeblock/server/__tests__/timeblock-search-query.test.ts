import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `buildTimeblockSearchFilter` の分類名検索が **アクティビティとタグの和集合**である
 * ことを凍結する（#2162）。
 *
 * cutover 後のブロックは `activity_id` を持ち `tag_id` を持たない。cutover 前の旧ブロックは
 * 逆になる。片側だけを見ると、もう一方の世代が検索から丸ごと消える。E2E は seed を
 * activities へ移したためタグ側を踏まなくなっており、この test がタグ経路の唯一の網。
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

  it('タグ名の一致を tag_id フィルタへ載せる（cutover 前の旧ブロックを消さない）', async () => {
    const { result } = buildWith({ tags: [{ id: 'tag-1' }] });

    await expect(result).resolves.toBe('note.ilike.%design%,tag_id.in.(tag-1)');
  });

  it('両方一致したら和集合にする（どちらの世代のブロックも引ける）', async () => {
    const { result } = buildWith({
      activities: [{ id: 'act-1' }],
      tags: [{ id: 'tag-1' }],
    });

    await expect(result).resolves.toBe(
      'note.ilike.%design%,activity_id.in.(act-1),tag_id.in.(tag-1)',
    );
  });

  it('分類が一致しなければ note だけで引く', async () => {
    const { result } = buildWith({});

    await expect(result).resolves.toBe('note.ilike.%design%');
  });

  it('activities と tags の両方を引く', async () => {
    const { seen, result } = buildWith({});
    await result;

    expect(seen).toEqual(expect.arrayContaining(['activities', 'tags']));
  });

  it('記号だけの入力は無条件一覧へフォールバックしない', async () => {
    const { result } = buildWith({ activities: [{ id: 'act-1' }] }, '(),.*');

    await expect(result).resolves.toBe('id.is.null');
  });

  it('分類クエリが失敗したら検索語を含めずに FETCH_FAILED を投げる', async () => {
    runPrivateTimeblockSearchQuery.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    runPrivateTimeblockSearchQuery.mockResolvedValueOnce({ data: [], error: null });

    const { result } = buildWith({}, 'secret-words');

    await expect(result).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to search timeblock classifications',
    });
    await expect(result.catch((e: Error) => e.message)).resolves.not.toContain('secret-words');
  });
});
