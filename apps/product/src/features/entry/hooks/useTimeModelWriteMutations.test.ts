import { describe, expect, it } from 'vitest';

import {
  doesTimeModelListQueryIncludeRow,
  useTimeModelWriteMutations,
} from './useTimeModelWriteMutations';

const row = {
  id: 'log-1',
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

function listKey(input: Record<string, unknown>) {
  return [['logs', 'list'], { input, type: 'query' }];
}

describe('useTimeModelWriteMutations', () => {
  it('Plan と Log の作成・編集 mutation をまとめる hook を提供する', () => {
    expect(useTimeModelWriteMutations).toBeTypeOf('function');
  });

  it('planIdが異なるlogs.listには作成行を入れない', () => {
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ planId: 'plan-2', limit: 1 }), row, 'logs'),
    ).toBe(false);
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ planId: 'plan-1', limit: 1 }), row, 'logs'),
    ).toBe(true);
  });

  it('表示期間と重なる行だけを対象にする（offset付きcreateは除外）', () => {
    expect(
      doesTimeModelListQueryIncludeRow(
        listKey({
          startDate: '2026-07-10T09:30:00+09:00',
          endDate: '2026-07-10T11:30:00+09:00',
        }),
        row,
        'logs',
      ),
    ).toBe(true);
    expect(
      doesTimeModelListQueryIncludeRow(
        listKey({
          startDate: '2026-07-11T00:00:00+09:00',
          endDate: '2026-07-12T00:00:00+09:00',
        }),
        row,
        'logs',
      ),
    ).toBe(false);
    expect(doesTimeModelListQueryIncludeRow(listKey({ offset: 10 }), row, 'logs')).toBe(false);
  });

  it('tagとsearch filterを両方満たす場合だけ対象にする', () => {
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ tagId: 'tag-1', search: 'focus' }), row, 'logs'),
    ).toBe(true);
    expect(
      doesTimeModelListQueryIncludeRow(listKey({ tagId: 'tag-2', search: 'focus' }), row, 'logs'),
    ).toBe(false);
  });
});
