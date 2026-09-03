import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createReportAggregationService } from './report-aggregation-service';

import type { ReportFetchClient } from './report-fetchers';

vi.mock('server-only', () => ({}));

const TOKYO = 'Asia/Tokyo';
const USER_ID = 'user-1';
/** 2026-09-04（金）12:00 JST。週 08-31（月）〜 09-07（月）の途中。 */
const NOW = new Date('2026-09-04T03:00:00.000Z');

interface RecordSeed {
  id: string;
  activity_id: string | null;
  start_at: string;
  end_at: string;
  fulfillment?: string | null;
  user_id?: string;
}

interface PlanSeed {
  id: string;
  activity_id: string | null;
  start_at: string;
  end_at: string;
  user_id?: string;
}

interface ActivitySeed {
  id: string;
  name: string;
  category_id: string | null;
  archived_at?: string | null;
  user_id?: string;
}

interface CategorySeed {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  user_id?: string;
}

interface Seed {
  records?: RecordSeed[];
  plans?: PlanSeed[];
  activities?: ActivitySeed[];
  categories?: CategorySeed[];
}

/**
 * PostgREST の `.eq` / `.is` / `.lt` / `.gt` を素朴に再現する fake。
 *
 * **`user_id` の絞り込みも実際にかける**。service が `.eq('user_id', ...)` を落とした場合に
 * 他ユーザーの行が混ざることを test が検出できるようにするため（allowlist ではなく実挙動で
 * 押さえる）。
 */
function createFakeClient(seed: Seed): ReportFetchClient {
  const tables: Record<string, Record<string, unknown>[]> = {
    records: (seed.records ?? []).map((row) => ({
      user_id: USER_ID,
      deleted_at: null,
      fulfillment: null,
      ...row,
    })),
    plans: (seed.plans ?? []).map((row) => ({
      user_id: USER_ID,
      deleted_at: null,
      skipped_at: null,
      ...row,
    })),
    activities: (seed.activities ?? []).map((row) => ({
      user_id: USER_ID,
      archived_at: null,
      ...row,
    })),
    categories: (seed.categories ?? []).map((row) => ({
      user_id: USER_ID,
      color: null,
      icon: null,
      ...row,
    })),
  };

  function createQuery(rows: Record<string, unknown>[]) {
    let current = rows;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        current = current.filter((row) => row[column] === value);
        return query;
      },
      is: (column: string, value: unknown) => {
        current = current.filter((row) => row[column] === value);
        return query;
      },
      lt: (column: string, value: string) => {
        current = current.filter((row) => Date.parse(String(row[column])) < Date.parse(value));
        return query;
      },
      gt: (column: string, value: string) => {
        current = current.filter((row) => Date.parse(String(row[column])) > Date.parse(value));
        return query;
      },
      then: (
        resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown,
      ): unknown => resolve({ data: current, error: null }),
    };
    return query;
  }

  return {
    from: (table: string) => createQuery(tables[table] ?? []),
  } as unknown as ReportFetchClient;
}

function baseInput(anchorDate = '2026-09-04') {
  return { anchorDate, granularity: 'week' as const, timezone: TOKYO, weekStartsOn: 1 as const };
}

function aggregateFor(
  result: Awaited<ReturnType<ReturnType<typeof createReportAggregationService>['getReportPeriod']>>,
  activityId: string | null,
) {
  return result.activities.find((row) => row.activityId === activityId);
}

describe('ReportAggregationService.getReportPeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('期間と前期間・列キーを返す', async () => {
    const service = createReportAggregationService(createFakeClient({}));

    const result = await service.getReportPeriod(USER_ID, baseInput(), NOW);

    expect(result.period.startAt).toBe('2026-08-30T15:00:00.000Z');
    expect(result.period.endAt).toBe('2026-09-06T15:00:00.000Z');
    expect(result.period.lengthMinutes).toBe(10080);
    expect(result.period.bucketKeys).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(result.previous.endAt).toBe(result.period.startAt);
    expect(result.nowAt).toBe(NOW.toISOString());
    expect(result.activities).toEqual([]);
  });

  it('記録を分に畳み、列へ按分する', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '執筆', category_id: 'c1' }],
        categories: [{ id: 'c1', name: '仕事', color: 'blue', icon: 'pen' }],
        records: [
          // JST 09-02(水) 09:00〜10:30
          {
            id: 'r1',
            activity_id: 'a1',
            start_at: '2026-09-02T00:00:00+00:00',
            end_at: '2026-09-02T01:30:00+00:00',
          },
        ],
      }),
    );

    const result = await service.getReportPeriod(USER_ID, baseInput(), NOW);
    const row = aggregateFor(result, 'a1');

    expect(row?.recordedMinutes).toBe(90);
    expect(row?.recordBoxes).toBe(1);
    expect(row?.byBucket).toEqual([0, 0, 90, 0, 0, 0, 0]);
    expect(row?.activityName).toBe('執筆');
    expect(row?.categoryId).toBe('c1');
    expect(row?.categoryName).toBe('仕事');
    expect(row?.categoryColor).toBe('blue');
    expect(row?.archived).toBe(false);
  });

  it('期間境界を跨ぐ記録が clip され、跨いだ先の期間にも計上される', async () => {
    // JST 09-06(日) 23:00 〜 09-07(月) 07:00 の睡眠（8 時間）。週境界は 09-07 00:00 JST
    const sleep = {
      id: 'r1',
      activity_id: 'a1',
      start_at: '2026-09-06T14:00:00+00:00',
      end_at: '2026-09-06T22:00:00+00:00',
    };
    const seed = {
      activities: [{ id: 'a1', name: '睡眠', category_id: null }],
      records: [sleep],
    };

    const thisWeek = await createReportAggregationService(createFakeClient(seed)).getReportPeriod(
      USER_ID,
      baseInput('2026-09-04'),
      NOW,
    );
    const nextWeek = await createReportAggregationService(createFakeClient(seed)).getReportPeriod(
      USER_ID,
      baseInput('2026-09-09'),
      new Date('2026-09-11T03:00:00.000Z'),
    );

    expect(aggregateFor(thisWeek, 'a1')?.recordedMinutes).toBe(60);
    expect(aggregateFor(nextWeek, 'a1')?.recordedMinutes).toBe(420);
    // 両側の合計が元の長さと一致する（#2426 の「片側へ丸ごと帰属」を作らない）
    expect(
      (aggregateFor(thisWeek, 'a1')?.recordedMinutes ?? 0) +
        (aggregateFor(nextWeek, 'a1')?.recordedMinutes ?? 0),
    ).toBe(480);

    // 今週側は最終列（日曜）にだけ乗る
    expect(aggregateFor(thisWeek, 'a1')?.byBucket).toEqual([0, 0, 0, 0, 0, 0, 60]);
    // 来週側は先頭列（月曜）にだけ乗る
    expect(aggregateFor(nextWeek, 'a1')?.byBucket).toEqual([420, 0, 0, 0, 0, 0, 0]);
  });

  it('0 時をまたぐ記録が 2 日へ按分され、合計が記録合計と一致する', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '睡眠', category_id: null }],
        records: [
          // JST 09-02(水) 23:00 〜 09-03(木) 07:00
          {
            id: 'r1',
            activity_id: 'a1',
            start_at: '2026-09-02T14:00:00+00:00',
            end_at: '2026-09-02T22:00:00+00:00',
          },
        ],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), 'a1');

    expect(row?.byBucket[2]).toBe(60);
    expect(row?.byBucket[3]).toBe(420);
    expect(row?.byBucket.reduce((sum, value) => sum + value, 0)).toBe(row?.recordedMinutes);
  });

  it('planPast は開始が now 以下の予定だけを数える', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '執筆', category_id: null }],
        plans: [
          // 過去（JST 09-02 09:00〜10:00）
          {
            id: 'p1',
            activity_id: 'a1',
            start_at: '2026-09-02T00:00:00+00:00',
            end_at: '2026-09-02T01:00:00+00:00',
          },
          // 過去（JST 09-03 09:00〜11:00）
          {
            id: 'p2',
            activity_id: 'a1',
            start_at: '2026-09-03T00:00:00+00:00',
            end_at: '2026-09-03T02:00:00+00:00',
          },
          // 未来（JST 09-05 09:00〜13:00）。now は 09-04 12:00 JST
          {
            id: 'p3',
            activity_id: 'a1',
            start_at: '2026-09-05T00:00:00+00:00',
            end_at: '2026-09-05T04:00:00+00:00',
          },
        ],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), 'a1');

    expect(row?.plannedMinutes).toBe(60 + 120 + 240);
    expect(row?.plannedPastMinutes).toBe(60 + 120);
    expect(row?.plannedPastBoxes).toBe(2);
  });

  it('now とちょうど同時刻に始まる予定は planPast に入る（境界は含む）', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '執筆', category_id: null }],
        plans: [
          {
            id: 'p1',
            activity_id: 'a1',
            start_at: '2026-09-04T03:00:00+00:00', // NOW と同時刻（表記だけ違う）
            end_at: '2026-09-04T04:00:00+00:00',
          },
        ],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), 'a1');

    expect(row?.plannedPastBoxes).toBe(1);
    expect(row?.plannedPastMinutes).toBe(60);
  });

  it('充実の回答を 3 値で数え、未回答は数えない', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '執筆', category_id: null }],
        records: [
          mkRecord('r1', 'a1', '2026-09-02T00:00:00+00:00', '2026-09-02T01:00:00+00:00', 'high'),
          mkRecord('r2', 'a1', '2026-09-02T02:00:00+00:00', '2026-09-02T03:00:00+00:00', 'high'),
          mkRecord('r3', 'a1', '2026-09-02T04:00:00+00:00', '2026-09-02T05:00:00+00:00', 'low'),
          mkRecord('r4', 'a1', '2026-09-02T06:00:00+00:00', '2026-09-02T07:00:00+00:00', 'medium'),
          mkRecord('r5', 'a1', '2026-09-03T00:00:00+00:00', '2026-09-03T01:00:00+00:00', null),
          // 未知の値が入っても落ちない
          mkRecord('r6', 'a1', '2026-09-03T02:00:00+00:00', '2026-09-03T03:00:00+00:00', 'unknown'),
        ],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), 'a1');

    expect(row?.fulfillment).toEqual({ low: 1, medium: 1, high: 2 });
    expect(row?.recordBoxes).toBe(6);
  });

  it('アーカイブ済みアクティビティでも記録があれば行を返す', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [
          { id: 'a1', name: '旧習慣', category_id: 'c1', archived_at: '2026-08-01T00:00:00+00:00' },
        ],
        categories: [{ id: 'c1', name: '生活', color: 'green', icon: 'home' }],
        records: [mkRecord('r1', 'a1', '2026-09-02T00:00:00+00:00', '2026-09-02T01:00:00+00:00')],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), 'a1');

    expect(row?.archived).toBe(true);
    expect(row?.recordedMinutes).toBe(60);
    expect(row?.categoryName).toBe('生活');
  });

  it('カテゴリー未設定のアクティビティは categoryId が null になる', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '雑務', category_id: null }],
        records: [mkRecord('r1', 'a1', '2026-09-02T00:00:00+00:00', '2026-09-02T01:00:00+00:00')],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), 'a1');

    expect(row?.categoryId).toBeNull();
    expect(row?.categoryName).toBeNull();
    expect(row?.categoryColor).toBeNull();
  });

  it('アクティビティ未設定の記録は activityId が null の行になる', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        records: [mkRecord('r1', null, '2026-09-02T00:00:00+00:00', '2026-09-02T01:00:00+00:00')],
      }),
    );

    const row = aggregateFor(await service.getReportPeriod(USER_ID, baseInput(), NOW), null);

    expect(row?.recordedMinutes).toBe(60);
    expect(row?.activityName).toBeNull();
    expect(row?.categoryId).toBeNull();
  });

  it('別ユーザーの記録・予定・アクティビティを混ぜない', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [
          { id: 'a1', name: '自分', category_id: null },
          { id: 'a2', name: '他人', category_id: null, user_id: 'user-2' },
        ],
        records: [
          mkRecord('r1', 'a1', '2026-09-02T00:00:00+00:00', '2026-09-02T01:00:00+00:00'),
          {
            ...mkRecord('r2', 'a2', '2026-09-02T00:00:00+00:00', '2026-09-02T05:00:00+00:00'),
            user_id: 'user-2',
          },
        ],
      }),
    );

    const result = await service.getReportPeriod(USER_ID, baseInput(), NOW);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.activityId).toBe('a1');
    expect(result.activities[0]?.recordedMinutes).toBe(60);
  });

  it('削除済み・skip 済みの行を集計しない', async () => {
    const result = await createReportAggregationService(
      createFakeClientWithFlags(),
    ).getReportPeriod(USER_ID, baseInput(), NOW);

    // deleted_at 付きの Record と skipped_at 付きの Plan は fetcher の `.is(..., null)` で落ちる
    expect(result.activities).toEqual([]);
    expect(result.uncategorizedRecordCount).toBe(0);
  });

  it('未分類の記録件数を数える（アクティビティ未設定も含む）', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [
          { id: 'a1', name: '執筆', category_id: 'c1' },
          { id: 'a2', name: '雑務', category_id: null },
        ],
        categories: [{ id: 'c1', name: '仕事' }],
        records: [
          mkRecord('r1', 'a1', '2026-09-02T00:00:00+00:00', '2026-09-02T01:00:00+00:00'),
          mkRecord('r2', 'a2', '2026-09-02T02:00:00+00:00', '2026-09-02T03:00:00+00:00'),
          mkRecord('r3', null, '2026-09-02T04:00:00+00:00', '2026-09-02T05:00:00+00:00'),
        ],
      }),
    );

    const result = await service.getReportPeriod(USER_ID, baseInput(), NOW);

    expect(result.uncategorizedRecordCount).toBe(2);
  });

  it('次期間の予定合計を返す', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '執筆', category_id: null }],
        plans: [
          // 来週（JST 09-08 09:00〜11:00）
          {
            id: 'p1',
            activity_id: 'a1',
            start_at: '2026-09-08T00:00:00+00:00',
            end_at: '2026-09-08T02:00:00+00:00',
          },
        ],
      }),
    );

    const result = await service.getReportPeriod(USER_ID, baseInput(), NOW);

    expect(result.nextPeriodPlannedMinutes).toBe(120);
    // 今期間の集計には来週の予定が入らない
    expect(aggregateFor(result, 'a1')).toBeUndefined();
  });

  it('前期間の記録合計を Δ 用に返す', async () => {
    const service = createReportAggregationService(
      createFakeClient({
        activities: [{ id: 'a1', name: '執筆', category_id: null }],
        records: [
          // 前週（JST 08-26 09:00〜11:00）
          mkRecord('r1', 'a1', '2026-08-26T00:00:00+00:00', '2026-08-26T02:00:00+00:00'),
        ],
      }),
    );

    const result = await service.getReportPeriod(USER_ID, baseInput(), NOW);

    expect(result.previousActivities).toEqual([{ activityId: 'a1', recordedMinutes: 120 }]);
    expect(result.activities).toEqual([]);
  });

  it('月粒度では週の列を返す', async () => {
    const service = createReportAggregationService(createFakeClient({}));

    const result = await service.getReportPeriod(
      USER_ID,
      { anchorDate: '2026-09-15', granularity: 'month', timezone: TOKYO, weekStartsOn: 1 },
      NOW,
    );

    expect(result.period.bucketKeys[0]).toBe('2026-09-01');
    expect(result.period.lengthMinutes).toBe(30 * 1440);
  });

  it('年粒度では 12 列を返す', async () => {
    const service = createReportAggregationService(createFakeClient({}));

    const result = await service.getReportPeriod(
      USER_ID,
      { anchorDate: '2026-06-15', granularity: 'year', timezone: TOKYO, weekStartsOn: 1 },
      NOW,
    );

    expect(result.period.bucketKeys).toHaveLength(12);
    expect(result.period.bucketKeys[0]).toBe('2026-01');
  });
});

function mkRecord(
  id: string,
  activityId: string | null,
  startAt: string,
  endAt: string,
  fulfillment: string | null = null,
): RecordSeed {
  return { id, activity_id: activityId, start_at: startAt, end_at: endAt, fulfillment };
}

/** `deleted_at` / `skipped_at` が立った行だけを持つ client。fetcher の除外条件を押さえる。 */
function createFakeClientWithFlags(): ReportFetchClient {
  const tables: Record<string, Record<string, unknown>[]> = {
    records: [
      {
        id: 'r1',
        user_id: USER_ID,
        activity_id: 'a1',
        start_at: '2026-09-02T00:00:00+00:00',
        end_at: '2026-09-02T01:00:00+00:00',
        fulfillment: null,
        deleted_at: '2026-09-02T05:00:00+00:00',
      },
    ],
    plans: [
      {
        id: 'p1',
        user_id: USER_ID,
        activity_id: 'a1',
        start_at: '2026-09-02T00:00:00+00:00',
        end_at: '2026-09-02T01:00:00+00:00',
        deleted_at: null,
        skipped_at: '2026-09-02T05:00:00+00:00',
      },
    ],
    activities: [
      { id: 'a1', user_id: USER_ID, name: '執筆', category_id: null, archived_at: null },
    ],
    categories: [],
  };

  function createQuery(rows: Record<string, unknown>[]) {
    let current = rows;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        current = current.filter((row) => row[column] === value);
        return query;
      },
      is: (column: string, value: unknown) => {
        current = current.filter((row) => row[column] === value);
        return query;
      },
      lt: (column: string, value: string) => {
        current = current.filter((row) => Date.parse(String(row[column])) < Date.parse(value));
        return query;
      },
      gt: (column: string, value: string) => {
        current = current.filter((row) => Date.parse(String(row[column])) > Date.parse(value));
        return query;
      },
      then: (
        resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown,
      ): unknown => resolve({ data: current, error: null }),
    };
    return query;
  }

  return {
    from: (table: string) => createQuery(tables[table] ?? []),
  } as unknown as ReportFetchClient;
}
