import { beforeEach, describe, expect, it } from 'vitest';

import { invalidateUserTimezoneCache } from '@/lib/server/user-timezone-cache';
import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';
import { StatisticsService } from './statistics-service';
import type { ServiceSupabaseClient } from './types';

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

function createVisibleDaysReviewService() {
  const timeblocks = [
    {
      id: 'visible-thursday',
      activity_id: 'activity-1',
      plan_id: null,
      source: 'manual',
      start_at: '2026-01-15T09:00:00Z',
      end_at: '2026-01-15T10:00:00Z',
    },
    {
      id: 'hidden-saturday',
      activity_id: 'activity-1',
      plan_id: null,
      source: 'manual',
      start_at: '2026-01-17T09:00:00Z',
      end_at: '2026-01-17T11:00:00Z',
    },
    {
      id: 'visible-monday',
      activity_id: 'activity-1',
      plan_id: null,
      source: 'manual',
      start_at: '2026-01-19T09:00:00Z',
      end_at: '2026-01-19T09:45:00Z',
    },
    {
      id: 'previous-monday',
      activity_id: 'activity-1',
      plan_id: null,
      source: 'manual',
      start_at: '2026-01-12T09:00:00Z',
      end_at: '2026-01-12T09:30:00Z',
    },
  ];

  return createService({
    user_settings: createChainableMock({ timezone: 'UTC' }),
    records: createChainableMock(timeblocks),
    plans: createChainableMock(timeblocks),
    activities: createChainableMock([
      { id: 'activity-1', name: 'Deep Work', category_id: 'category-1' },
    ]),
    categories: createChainableMock([
      { id: 'category-1', name: '仕事', color: 'blue', icon: 'brain' },
    ]),
  });
}

beforeEach(() => {
  invalidateUserTimezoneCache(USER_ID);
});

describe('StatisticsService.getActivityStats', () => {
  it('records をアクティビティ別に集計し counts/lastUsed を返す（deleted は除外済み前提）', async () => {
    const { service } = createService({
      records: createChainableMock([
        {
          id: 'l1',
          activity_id: 'activity-1',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
        {
          id: 'l2',
          activity_id: 'activity-1',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T01:00:00Z',
        },
        {
          id: 'l3',
          activity_id: 'activity-2',
          plan_id: null,
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
      ]),
      plans: createChainableMock([]),
    });

    const result = await service.getActivityStats(USER_ID);

    // counts は records のみの実績件数（サイドバー等の「実績件数」表示用途の契約は不変）
    expect(result.counts).toEqual({ 'activity-1': 2, 'activity-2': 1 });
    expect(result.lastUsed).toEqual({
      'activity-1': '2026-07-02T00:00:00Z',
      'activity-2': '2026-07-01T00:00:00Z',
    });
    expect(result.planCounts).toEqual({});
  });

  it('record が無い場合は空の counts/lastUsed/planCounts を返す', async () => {
    const { service } = createService({
      records: createChainableMock([]),
      plans: createChainableMock([]),
    });
    expect(await service.getActivityStats(USER_ID)).toEqual({
      counts: {},
      lastUsed: {},
      planCounts: {},
    });
  });

  it('Plan のみ（record 無し）のアクティビティは counts=0 のまま、planCounts に件数が反映される（#1576フォローアップ）', async () => {
    const { service } = createService({
      records: createChainableMock([]),
      plans: createChainableMock([
        {
          id: 'p1',
          activity_id: 'activity-future',
          start_at: '2026-08-10T00:00:00Z',
          end_at: '2026-08-10T01:00:00Z',
        },
      ]),
    });

    const result = await service.getActivityStats(USER_ID);

    // records が無いアクティビティは counts に現れない（0 扱い） — 削除確認の合計判定は呼び出し側が
    // counts + planCounts を合算する（apps/product/src/features/calendar/components/
    // activity-filter/activity-delete-counts.ts の mergeActivityDeleteCounts）
    expect(result.counts['activity-future']).toBeUndefined();
    expect(result.planCounts).toEqual({ 'activity-future': 1 });
  });

  it('records と plans 両方を持つアクティビティは counts/planCounts がそれぞれ独立して反映される', async () => {
    const { service } = createService({
      records: createChainableMock([
        {
          id: 'l1',
          activity_id: 'activity-1',
          plan_id: 'p1',
          source: 'from_plan',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
      ]),
      plans: createChainableMock([
        {
          id: 'p1',
          activity_id: 'activity-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
        {
          id: 'p2',
          activity_id: 'activity-1',
          start_at: '2026-07-08T00:00:00Z',
          end_at: '2026-07-08T01:00:00Z',
        },
      ]),
    });

    const result = await service.getActivityStats(USER_ID);

    expect(result.counts).toEqual({ 'activity-1': 1 });
    expect(result.planCounts).toEqual({ 'activity-1': 2 });
  });

  it('activity_id が null の Plan（未分類）は planCounts に含めない', async () => {
    const { service } = createService({
      records: createChainableMock([]),
      plans: createChainableMock([
        {
          id: 'p1',
          activity_id: null,
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
      ]),
    });

    const result = await service.getActivityStats(USER_ID);
    expect(result.planCounts).toEqual({});
  });
});

describe('StatisticsService.getEstimationAccuracy', () => {
  it('plan に紐づく非 auto_migrated record を実績として 1:N 集計する', async () => {
    const { service, mockSupabase } = createService({
      plans: createChainableMock([
        {
          id: 'p1',
          activity_id: 'activity-1',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:00:00Z',
        },
        {
          id: 'p2',
          activity_id: 'activity-1',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T00:30:00Z',
        },
      ]),
      activities: createChainableMock([
        { id: 'activity-1', name: 'Deep Work', category_id: 'category-1' },
      ]),
      categories: createChainableMock([
        { id: 'category-1', name: '仕事', color: 'blue', icon: null },
      ]),
      records: createChainableMock([
        {
          id: 'l1',
          activity_id: 'activity-1',
          plan_id: 'p1',
          source: 'from_plan',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T01:30:00Z',
        },
        {
          id: 'l2',
          activity_id: 'activity-1',
          plan_id: 'p2',
          source: 'auto_migrated',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T00:30:00Z',
        },
      ]),
    });

    const result = await service.getEstimationAccuracy(USER_ID);

    // p2 の record は auto_migrated なので実績なし扱い → record_count は p1 のみで 1 件 → HAVING で除外
    expect(result).toEqual([]);
    expect(mockSupabase.from).toHaveBeenCalledWith('plans');
    expect(mockSupabase.from).toHaveBeenCalledWith('records');
  });

  it('未設定と削除済みアクティビティの Plan / Record を同じ未分類 bucket に集計する（#1576 を activity 軸へ踏襲）', async () => {
    const { service } = createService({
      plans: createChainableMock([
        {
          id: 'p-unset',
          activity_id: null,
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T00:30:00Z',
        },
        {
          id: 'p-deleted',
          activity_id: 'deleted-activity-id',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T00:50:00Z',
        },
      ]),
      activities: createChainableMock([
        { id: 'activity-1', name: 'Deep Work', category_id: 'category-1' },
      ]),
      categories: createChainableMock([
        { id: 'category-1', name: '仕事', color: 'blue', icon: null },
      ]),
      records: createChainableMock([
        {
          id: 'l1',
          activity_id: null,
          plan_id: 'p-unset',
          source: 'manual',
          start_at: '2026-07-01T00:00:00Z',
          end_at: '2026-07-01T00:40:00Z',
        },
        {
          id: 'l2',
          activity_id: 'deleted-activity-id',
          plan_id: 'p-deleted',
          source: 'manual',
          start_at: '2026-07-02T00:00:00Z',
          end_at: '2026-07-02T01:00:00Z',
        },
      ]),
    });

    const result = await service.getEstimationAccuracy(USER_ID);

    expect(result).toEqual([
      {
        activityId: null,
        activityName: null,
        activityColor: null,
        isUncategorized: true,
        avgPlannedMinutes: 40,
        avgActualMinutes: 50,
        avgDeviationMinutes: 10,
        recordCount: 2,
      },
    ]);
  });
});

describe('StatisticsService.getBlankRate', () => {
  it('plans の合計時間から空白率を算出する', async () => {
    const { service } = createService({
      plans: createChainableMock([
        {
          id: 'p1',
          activity_id: 'activity-1',
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

describe('StatisticsService Review visible days', () => {
  const rangeInput = {
    startDate: '2026-01-15T00:00:00.000Z',
    endDate: '2026-01-19T23:59:59.999Z',
    prevStart: '2026-01-12T00:00:00.000Z',
    prevEnd: '2026-01-14T23:59:59.999Z',
    visibleDateKeys: ['2026-01-15', '2026-01-16', '2026-01-19'],
    prevVisibleDateKeys: ['2026-01-12', '2026-01-13', '2026-01-14'],
    wakeHour: 7,
    sleepHour: 23,
  };

  it('Time P/L は非表示の週末を予実と可用時間から除外する', async () => {
    const { service } = createVisibleDaysReviewService();

    const result = await service.getTimePLData(USER_ID, rangeInput);

    expect(result.activities).toEqual([
      {
        activityId: 'activity-1',
        activityName: 'Deep Work',
        categoryColor: 'blue',
        categoryIcon: 'brain',
        budgetMinutes: 105,
        actualMinutes: 105,
        isPlanned: true,
        isNoActivity: false,
      },
    ]);
    expect(result.prevActivities).toEqual([
      expect.objectContaining({ budgetMinutes: 30, actualMinutes: 30 }),
    ]);
    expect(result.availableMinutes).toBe(3 * 16 * 60);
  });

  it('Time P/L は未設定と削除済みアクティビティの Plan / Record を同じアクティビティなし bucket に含める', async () => {
    const { service } = createService({
      user_settings: createChainableMock({ timezone: 'UTC' }),
      activities: createChainableMock([
        { id: 'activity-1', name: 'Deep Work', category_id: 'category-1' },
      ]),
      categories: createChainableMock([
        { id: 'category-1', name: '仕事', color: 'blue', icon: 'brain' },
      ]),
      plans: createChainableMock([
        {
          id: 'plan-known',
          activity_id: 'activity-1',
          start_at: '2026-01-15T09:00:00Z',
          end_at: '2026-01-15T10:00:00Z',
        },
        {
          id: 'plan-unset',
          activity_id: null,
          start_at: '2026-01-15T10:00:00Z',
          end_at: '2026-01-15T10:30:00Z',
        },
        {
          id: 'plan-deleted',
          activity_id: 'deleted-activity-id',
          start_at: '2026-01-15T11:00:00Z',
          end_at: '2026-01-15T11:45:00Z',
        },
      ]),
      records: createChainableMock([
        {
          id: 'record-known',
          activity_id: 'activity-1',
          plan_id: null,
          source: 'manual',
          start_at: '2026-01-15T09:00:00Z',
          end_at: '2026-01-15T09:50:00Z',
        },
        {
          id: 'record-unset',
          activity_id: null,
          plan_id: null,
          source: 'manual',
          start_at: '2026-01-15T10:00:00Z',
          end_at: '2026-01-15T10:20:00Z',
        },
        {
          id: 'record-deleted',
          activity_id: 'deleted-activity-id',
          plan_id: null,
          source: 'manual',
          start_at: '2026-01-15T11:00:00Z',
          end_at: '2026-01-15T11:40:00Z',
        },
      ]),
    });

    const result = await service.getTimePLData(USER_ID, {
      startDate: '2026-01-15T00:00:00.000Z',
      endDate: '2026-01-15T23:59:59.999Z',
      wakeHour: 7,
      sleepHour: 23,
    });

    expect(result.activities).toEqual([
      {
        activityId: null,
        activityName: null,
        categoryColor: null,
        categoryIcon: null,
        budgetMinutes: 75,
        actualMinutes: 60,
        isPlanned: true,
        isNoActivity: true,
      },
      {
        activityId: 'activity-1',
        activityName: 'Deep Work',
        categoryColor: 'blue',
        categoryIcon: 'brain',
        budgetMinutes: 60,
        actualMinutes: 50,
        isPlanned: true,
        isNoActivity: false,
      },
    ]);
  });

  it('Review summary は非表示の週末をoverviewとblank rateから除外する', async () => {
    const { service } = createVisibleDaysReviewService();

    const result = await service.getStatsPageData(USER_ID, {
      ...rangeInput,
      year: 2026,
      monthlyMonths: 3,
    });

    expect(result.overview).toMatchObject({ totalMinutes: 105, totalEntries: 2 });
    expect(result.prevOverview).toMatchObject({ totalMinutes: 30, totalEntries: 1 });
    expect(result.blankRate).toEqual({
      availableMinutes: 3 * 16 * 60,
      scheduledMinutes: 105,
      blankRate: (3 * 16 * 60 - 105) / (3 * 16 * 60),
    });
  });
});

describe('StatisticsService.getSegmentTotals', () => {
  it('セグメント定義（activityIds）に含まれる予実だけを合計し、直前期間と比較できる形で返す', async () => {
    const { service } = createService({
      records: createChainableMock([
        {
          id: 'record-1',
          activity_id: 'activity-1',
          plan_id: null,
          start_at: '2026-01-15T09:00:00Z',
          end_at: '2026-01-15T10:00:00Z',
        },
        {
          id: 'record-other',
          activity_id: 'activity-2',
          plan_id: null,
          start_at: '2026-01-15T11:00:00Z',
          end_at: '2026-01-15T12:00:00Z',
        },
      ]),
      plans: createChainableMock([]),
      activities: createChainableMock([
        { id: 'activity-1', name: 'Deep Work', category_id: null },
        { id: 'activity-2', name: 'Admin', category_id: null },
      ]),
    });

    const result = await service.getSegmentTotals(USER_ID, {
      startDate: '2026-01-15T00:00:00.000Z',
      endDate: '2026-01-15T23:59:59.999Z',
      segments: [{ id: 'segment-1', name: '深い仕事', activityIds: ['activity-1'] }],
    });

    // activity-2（segment 非メンバー）は集計に含まれない
    expect(result.current).toEqual([
      { segmentId: 'segment-1', segmentName: '深い仕事', budgetMinutes: 0, actualMinutes: 60 },
    ]);
    // total / share フィールドを持たない（#2162 §6-3 の表示規律）
    expect(result.current[0]).not.toHaveProperty('total');
    expect(result.current[0]).not.toHaveProperty('share');
    // prevStart/prevEnd 未指定なので previous は空
    expect(result.previous).toEqual([]);
  });

  it('prevStart/prevEnd を指定すると直前期間分の fetch も行い previous を埋める', async () => {
    // createChainableMock は日付フィルタを解釈せず全件を返すため、ここでは
    // 「prevStart/prevEnd 指定時に previous が空でなくなる（2 回目の fetch が
    // 実際に行われ buildSegmentTotals へ渡る）」という配線を検証する。
    // 期間ごとの正確な分離は buildSegmentTotals 自身の unit test（純関数、
    // statistics-activity-axis-builders.test.ts）が担う。
    const { service } = createService({
      records: createChainableMock([
        {
          id: 'record-1',
          activity_id: 'activity-1',
          plan_id: null,
          start_at: '2026-01-15T09:00:00Z',
          end_at: '2026-01-15T10:00:00Z',
        },
      ]),
      plans: createChainableMock([]),
      activities: createChainableMock([{ id: 'activity-1', name: 'Deep Work', category_id: null }]),
    });

    const result = await service.getSegmentTotals(USER_ID, {
      startDate: '2026-01-15T00:00:00.000Z',
      endDate: '2026-01-15T23:59:59.999Z',
      prevStart: '2026-01-08T00:00:00.000Z',
      prevEnd: '2026-01-08T23:59:59.999Z',
      segments: [{ id: 'segment-1', name: '深い仕事', activityIds: ['activity-1'] }],
    });

    expect(result.current).toEqual([
      { segmentId: 'segment-1', segmentName: '深い仕事', budgetMinutes: 0, actualMinutes: 60 },
    ]);
    expect(result.previous).toEqual([
      { segmentId: 'segment-1', segmentName: '深い仕事', budgetMinutes: 0, actualMinutes: 60 },
    ]);
  });
});
