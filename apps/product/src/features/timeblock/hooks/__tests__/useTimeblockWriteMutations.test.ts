import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  doesTimeModelListQueryIncludeRow,
  isTimeblockConflictError,
  isTimeblockNotFoundError,
  replaceTimeModelRowInMatchingLists,
  useTimeblockWriteMutations,
} from '../useTimeblockWriteMutations';

const row = {
  id: 'record-1',
  title: 'Deep Work',
  note: 'Focus',
  tag_id: 'tag-1',
  plan_id: 'plan-1',
  start_at: '2026-07-10T01:00:00.000Z',
  end_at: '2026-07-10T02:00:00.000Z',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  deleted_at: null,
};

function listKey(input: Record<string, unknown>, lane: 'plans' | 'records' = 'records') {
  return [[lane, 'list'], { input, type: 'query' }];
}

describe('useTimeblockWriteMutations', () => {
  it('Plan と Record の作成・編集 mutation をまとめる hook を提供する', () => {
    expect(useTimeblockWriteMutations).toBeTypeOf('function');
  });

  it('planIdが異なるrecords.listには作成行を入れない', () => {
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ planId: 'plan-2', limit: 1 }), row, 'records'),
    ).toBe(false);
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ planId: 'plan-1', limit: 1 }), row, 'records'),
    ).toBe(true);
  });

  it('関連コンテキストのID配列に一致する行だけを対象にする', () => {
    expect(doesTimeModelListQueryIncludeRow(listKey({ planIds: ['plan-1'] }), row, 'records')).toBe(
      true,
    );
    expect(doesTimeModelListQueryIncludeRow(listKey({ planIds: ['plan-2'] }), row, 'records')).toBe(
      false,
    );
    expect(doesTimeModelListQueryIncludeRow(listKey({ planIds: [] }), row, 'records')).toBe(false);

    expect(
      doesTimeModelListQueryIncludeRow(listKey({ ids: ['record-1'] }, 'plans'), row, 'plans'),
    ).toBe(true);
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ ids: ['plan-2'] }, 'plans'), row, 'plans'),
    ).toBe(false);
    expect(doesTimeModelListQueryIncludeRow(listKey({ ids: [] }, 'plans'), row, 'plans')).toBe(
      false,
    );
  });

  it('表示期間と重なる行だけを対象にする（offset付きcreateは除外）', () => {
    expect(
      doesTimeModelListQueryIncludeRow(
        listKey({
          startDate: '2026-07-10T09:30:00+09:00',
          endDate: '2026-07-10T11:30:00+09:00',
        }),
        row,
        'records',
      ),
    ).toBe(true);
    expect(
      doesTimeModelListQueryIncludeRow(
        listKey({
          startDate: '2026-07-11T00:00:00+09:00',
          endDate: '2026-07-12T00:00:00+09:00',
        }),
        row,
        'records',
      ),
    ).toBe(false);
    expect(doesTimeModelListQueryIncludeRow(listKey({ offset: 10 }), row, 'records')).toBe(false);
  });

  it('tag filterは行から判定する', () => {
    expect(doesTimeModelListQueryIncludeRow(listKey({ tagId: 'tag-1' }), row, 'records')).toBe(
      true,
    );
    expect(doesTimeModelListQueryIncludeRow(listKey({ tagId: 'tag-2' }), row, 'records')).toBe(
      false,
    );
  });

  it('tag名を解決できないsearch cacheは楽観更新の一致対象にしない', () => {
    expect(doesTimeModelListQueryIncludeRow(listKey({ search: 'focus' }), row, 'records')).toBe(
      false,
    );
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ search: 'deep work' }), row, 'records', 'update'),
    ).toBe(false);
  });

  it('確定行がfilterを跨いだ時は元cacheから除外し一致する先頭pageへ追加する', () => {
    const queryClient = new QueryClient();
    const sourceKey = listKey({ tagId: 'tag-1' }) as QueryKey;
    const destinationKey = listKey({ tagId: 'tag-2' }) as QueryKey;
    const offsetKey = listKey({ tagId: 'tag-2', offset: 10 }) as QueryKey;
    queryClient.setQueryData(sourceKey, [row]);
    queryClient.setQueryData(destinationKey, []);
    queryClient.setQueryData(offsetKey, []);

    const updated = { ...row, tag_id: 'tag-2', updated_at: '2026-07-10T00:01:00.000Z' };
    replaceTimeModelRowInMatchingLists(queryClient, 'records', updated);

    expect(queryClient.getQueryData(sourceKey)).toEqual([]);
    expect(queryClient.getQueryData(destinationKey)).toEqual([updated]);
    expect(queryClient.getQueryData(offsetKey)).toEqual([]);
  });

  it('表示文言ではなくtRPCのstable service codeで競合を判定する', () => {
    expect(
      isTimeblockConflictError({
        data: { serviceCode: 'CONFLICT' },
        message: 'この項目は別の場所で変更されています',
      }),
    ).toBe(true);
    expect(
      isTimeblockConflictError({
        data: { serviceCode: 'TIME_OVERLAP' },
        message: '時間が重複しています',
      }),
    ).toBe(false);
  });

  it('service codeとtRPC codeのどちらでもNOT_FOUNDを判定する', () => {
    expect(isTimeblockNotFoundError({ data: { serviceCode: 'NOT_FOUND' } })).toBe(true);
    expect(isTimeblockNotFoundError({ data: { code: 'NOT_FOUND' } })).toBe(true);
    expect(isTimeblockNotFoundError({ data: { serviceCode: 'CONFLICT' } })).toBe(false);
  });
});
