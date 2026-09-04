import { describe, expect, it } from 'vitest';

import type { Activity } from '@/features/activities';

import { sortActivities } from './sort-activities';

const TIMESTAMPS = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function activity(id: string, name: string): Activity {
  return { id, name, user_id: 'user-1', category_id: null, archived_at: null, ...TIMESTAMPS };
}

const APPLE = activity('a', 'apple');
const BANANA = activity('b', 'banana');
const CHERRY = activity('c', 'cherry');

const names = (list: Activity[]) => list.map((a) => a.name);

describe('sortActivities', () => {
  it('名前順は lastUsed を無視して名前で並べる', () => {
    const result = sortActivities([CHERRY, APPLE, BANANA], 'name', {
      c: '2026-09-03T00:00:00.000Z',
    });
    expect(names(result)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('最終アクティビティ順は新しいものが上に来る', () => {
    const result = sortActivities([APPLE, BANANA, CHERRY], 'lastUsed', {
      a: '2026-09-01T00:00:00.000Z',
      b: '2026-09-03T00:00:00.000Z',
      c: '2026-09-02T00:00:00.000Z',
    });
    expect(names(result)).toEqual(['banana', 'cherry', 'apple']);
  });

  it('一度も使っていないものは末尾へ回す', () => {
    const result = sortActivities([APPLE, BANANA, CHERRY], 'lastUsed', {
      c: '2026-09-01T00:00:00.000Z',
    });
    expect(names(result)).toEqual(['cherry', 'apple', 'banana']);
  });

  it('未使用同士は名前順で決まる', () => {
    const result = sortActivities([CHERRY, BANANA, APPLE], 'lastUsed', {});
    expect(names(result)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('最終アクティビティが同時刻なら名前順で決まる（並びが揺れないこと）', () => {
    const sameMoment = '2026-09-03T00:00:00.000Z';
    const result = sortActivities([CHERRY, APPLE, BANANA], 'lastUsed', {
      a: sameMoment,
      b: sameMoment,
      c: sameMoment,
    });
    expect(names(result)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('入力配列を破壊しない（サーバーのキャッシュを直接並べ替えない）', () => {
    const input = [CHERRY, APPLE, BANANA];
    sortActivities(input, 'name', {});
    expect(names(input)).toEqual(['cherry', 'apple', 'banana']);
  });

  it('空配列でも落ちない', () => {
    expect(sortActivities([], 'lastUsed', {})).toEqual([]);
  });
});
