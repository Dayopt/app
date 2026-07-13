import { beforeEach, describe, expect, it } from 'vitest';

import { invalidateUserTimezoneCache } from '@/lib/server/user-timezone-cache';
import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';
import { StatisticsService } from '../statistics-service';
import type { ServiceSupabaseClient } from '../types';

const USER_ID = 'user-stats-1';

function createService(tableData: Record<string, ReturnType<typeof createChainableMock>>) {
  const mockSupabase = createMockSupabase();
  mockSupabase.from.mockImplementation((table: string) => {
    const mock = tableData[table];
    if (!mock) throw new Error(`Unexpected table access in test: ${table}`);
    return mock;
  });
  return {
    mockSupabase,
    service: new StatisticsService(mockSupabase as unknown as ServiceSupabaseClient),
  };
}

beforeEach(() => {
  invalidateUserTimezoneCache(USER_ID);
});

describe('StatisticsService.getTagStats', () => {
  it('records をタグ別に集計し counts/lastUsed を返す（deleted は除外済み前提）', async () => {
    const { service } = createService({
      records: createChainableMock([
        {
          id: 'l1',
          tag_id: 'tag-1',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
          fulfillment_score: null,
        },
        {
          id: 'l2',
          tag_id: 'tag-1',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T01:00:00Z',
          fulfillment_score: null,
        },
        {
          id: 'l3',
          tag_id: 'tag-2',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
          fulfillment_score: null,
        },
      ]),
    });

    const result = await service.getTagStats(USER_ID);

    expect(result.counts).toEqual({ 'tag-1': 2, 'tag-2': 1 });
    expect(result.lastUsed).toEqual({
      'tag-1': '2026-07-02T00:00:00Z',
      'tag-2': '2026-07-01T00:00:00Z',
    });
  });

  it('log が無い場合は空の counts/lastUsed を返す', async () => {
    const { service } = createService({ records: createChainableMock([]) });
    expect(await service.getTagStats(USER_ID)).toEqual({ counts: {}, lastUsed: {} });
  });
});

describe('StatisticsService.getTimeByTag', () => {
  it('records をタグ別合計時間に変換し hours 降順で返す', async () => {
    const { service } = createService({
      records: createChainableMock([
        {
          id: 'l1',
          tag_id: 'tag-1',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
          fulfillment_score: null,
        },
        {
          id: 'l2',
          tag_id: 'tag-2',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T03:00:00Z',
          fulfillment_score: null,
        },
      ]),
      tags: createChainableMock([
        { id: 'tag-1', name: 'Deep Work', color: 'blue', icon: null },
        { id: 'tag-2', name: 'Meeting', color: 'red', icon: null },
      ]),
    });

    const result = await service.getTimeByTag(USER_ID);

    expect(result).toEqual([
      { tagId: 'tag-2', name: 'Meeting', color: 'red', hours: 3 },
      { tagId: 'tag-1', name: 'Deep Work', color: 'blue', hours: 1 },
    ]);
  });
});

describe('StatisticsService.getEstimationAccuracy', () => {
  it('plan に紐づく非 auto_migrated log を実績として 1:N 集計する', async () => {
    const { service, mockSupabase } = createService({
      plans: createChainableMock([
        {
          id: 'p1',
          tag_id: 'tag-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
        {
          id: 'p2',
          tag_id: 'tag-1',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T00:30:00Z',
        },
      ]),
      tags: createChainableMock([{ id: 'tag-1', name: 'Deep Work', color: 'blue', icon: null }]),
      records: createChainableMock([
        {
          id: 'l1',
          tag_id: 'tag-1',
          plan_id: 'p1',
          source: 'from_plan',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:30:00Z',
          fulfillment_score: null,
        },
        {
          id: 'l2',
          tag_id: 'tag-1',
          plan_id: 'p2',
          source: 'auto_migrated',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T00:30:00Z',
          fulfillment_score: null,
        },
      ]),
    });

    const result = await service.getEstimationAccuracy(USER_ID);

    // p2 の log は auto_migrated なので実績なし扱い → record_count は p1 のみで 1 件 → HAVING で除外
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith('plans');
    expect(mockSupabase.from).toHaveBeenCalledWith('records');
  });
});

describe('StatisticsService.getBlankRate', () => {
  it('plans の合計時間から空白率を算出する', async () => {
    const { service } = createService({
      plans: createChainableMock([
        {
          id: 'p1',
          tag_id: 'tag-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
      ]),
    });

    const result = await service.getBlankRate(USER_ID, {
      startDate: '2026-07-01T00:00:00Z',
      endDate: '2026-07-02T00:00:00Z',
      wakeHour: 7,
      sleepHour: 23,
    });

    expect(result).toEqual({
      availableMinutes: 960,
      scheduledMinutes: 60,
      blankMinutes: 900,
      blankRate: 900 / 960,
    });
  });
});

describe('StatisticsService.getTagDashboard', () => {
  it('log を主とし、紐づく plan の予定時間を代表 log にのみ割り当てる', async () => {
    const { service } = createService({
      user_settings: createChainableMock({ timezone: 'UTC' }),
      tags: createChainableMock({ id: 'tag-1', name: 'Deep Work', color: 'blue', icon: 'brain' }),
      records: createChainableMock([
        {
          id: 'log-1',
          title: 'Focus session',
          note: null,
          tag_id: 'tag-1',
          plan_id: 'plan-1',
          source: 'from_plan',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
          fulfillment_score: null,
        },
      ]),
      plans: createChainableMock([
        {
          id: 'plan-1',
          title: 'Focus session',
          note: null,
          tag_id: 'tag-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T00:45:00Z',
          skipped_at: null,
        },
      ]),
    });

    const result = await service.getTagDashboard(USER_ID, {
      tagId: 'tag-1',
      startDate: '2026-06-30T00:00:00Z',
      endDate: '2026-07-02T00:00:00Z',
      limit: 50,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      timeblockId: 'log-1',
      plannedMinutes: 45,
      actualMinutes: 60,
      diffMinutes: 15,
    });
  });

  it('未記録・未 skip の plan は予定のみの行として残す', async () => {
    const { service } = createService({
      user_settings: createChainableMock({ timezone: 'UTC' }),
      tags: createChainableMock({ id: 'tag-1', name: 'Deep Work', color: 'blue', icon: null }),
      records: createChainableMock([]),
      plans: createChainableMock([
        {
          id: 'plan-1',
          title: 'Unrecorded plan',
          note: null,
          tag_id: 'tag-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
          skipped_at: null,
        },
      ]),
    });

    const result = await service.getTagDashboard(USER_ID, {
      tagId: 'tag-1',
      startDate: '2026-06-30T00:00:00Z',
      endDate: '2026-07-02T00:00:00Z',
      limit: 50,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      timeblockId: 'plan-1',
      plannedMinutes: 60,
      actualMinutes: 0,
    });
  });

  it('skip 済みの未記録 plan は表示しない', async () => {
    const { service } = createService({
      user_settings: createChainableMock({ timezone: 'UTC' }),
      tags: createChainableMock({ id: 'tag-1', name: 'Deep Work', color: 'blue', icon: null }),
      records: createChainableMock([]),
      plans: createChainableMock([
        {
          id: 'plan-1',
          title: 'Skipped plan',
          note: null,
          tag_id: 'tag-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
          skipped_at: '2026-07-01T02:00:00Z',
        },
      ]),
    });

    const result = await service.getTagDashboard(USER_ID, {
      tagId: 'tag-1',
      startDate: '2026-06-30T00:00:00Z',
      endDate: '2026-07-02T00:00:00Z',
      limit: 50,
    });

    expect(result.records).toHaveLength(0);
  });
});
