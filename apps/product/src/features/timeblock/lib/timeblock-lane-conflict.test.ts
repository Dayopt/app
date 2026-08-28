import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { collectTimeblockLaneItems, hasTimeblockLaneConflict } from './timeblock-lane-conflict';

const plan = {
  id: 'plan-1',
  start_at: '2026-07-17T09:00:00.000Z',
  end_at: '2026-07-17T10:00:00.000Z',
};

const record = {
  id: 'record-1',
  start_at: '2026-07-17T09:00:00.000Z',
  end_at: '2026-07-17T10:00:00.000Z',
};

describe('collectTimeblockLaneItems', () => {
  it('指定レーンのlist cacheだけを集め、同じidを重複させない', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([['plans', 'list'], { input: { startDate: '2026-07-17' } }], [plan]);
    queryClient.setQueryData([['plans', 'list'], { input: { tagId: 'tag-1' } }], [plan]);
    queryClient.setQueryData(
      [['records', 'list'], { input: { startDate: '2026-07-17' } }],
      [record],
    );

    expect(collectTimeblockLaneItems(queryClient, 'plans')).toEqual([plan]);
    expect(collectTimeblockLaneItems(queryClient, 'records')).toEqual([record]);
  });

  it('cacheが空またはundefinedなら空配列を返す', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([['plans', 'list'], { input: {} }], undefined);

    expect(collectTimeblockLaneItems(queryClient, 'plans')).toEqual([]);
  });
});

describe('hasTimeblockLaneConflict', () => {
  it('半開区間で重複を検出し、隣接する時間は許可する', () => {
    expect(
      hasTimeblockLaneConflict(
        [plan],
        new Date('2026-07-17T09:30:00.000Z'),
        new Date('2026-07-17T10:30:00.000Z'),
      ),
    ).toBe(true);
    expect(
      hasTimeblockLaneConflict(
        [plan],
        new Date('2026-07-17T10:00:00.000Z'),
        new Date('2026-07-17T11:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('編集中の行自身は重複対象から除外する', () => {
    expect(
      hasTimeblockLaneConflict([plan], new Date(plan.start_at), new Date(plan.end_at), plan.id),
    ).toBe(false);
  });
});
