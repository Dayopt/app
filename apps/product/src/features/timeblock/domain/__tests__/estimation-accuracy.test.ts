import { describe, expect, it } from 'vitest';

import {
  aggregatePlanRecordEstimationAccuracy,
  type EstimationAccuracyDbRow,
  type EstimationAccuracyPlanRow,
  type EstimationAccuracyRecordRow,
  type EstimationAccuracyTagLookup,
  transformEstimationAccuracy,
} from '../estimation-accuracy';

function makeRow(overrides: Partial<EstimationAccuracyDbRow> = {}): EstimationAccuracyDbRow {
  return {
    tag_id: 'tag-1',
    tag_name: 'Deep Work',
    tag_color: 'blue',
    is_uncategorized: false,
    avg_planned_minutes: 60,
    avg_actual_minutes: 75,
    avg_deviation_minutes: 15,
    record_count: 10,
    ...overrides,
  };
}

describe('transformEstimationAccuracy', () => {
  it('空配列 → 空配列', () => {
    expect(transformEstimationAccuracy([])).toEqual([]);
  });

  it('全フィールドを snake → camel に変換する', () => {
    const result = transformEstimationAccuracy([makeRow()]);
    expect(result[0]).toEqual({
      tagId: 'tag-1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      isUncategorized: false,
      avgPlannedMinutes: 60,
      avgActualMinutes: 75,
      avgDeviationMinutes: 15,
      recordCount: 10,
    });
  });

  it('is_uncategorized な row は tagColor を null のまま返す（空文字フォールバックを適用しない）', () => {
    const result = transformEstimationAccuracy([
      makeRow({ tag_id: null, tag_name: null, tag_color: null, is_uncategorized: true }),
    ]);
    expect(result[0]).toEqual({
      tagId: null,
      tagName: null,
      tagColor: null,
      isUncategorized: true,
      avgPlannedMinutes: 60,
      avgActualMinutes: 75,
      avgDeviationMinutes: 15,
      recordCount: 10,
    });
  });

  it('tag_color が空文字 → indigo にフォールバック', () => {
    const result = transformEstimationAccuracy([makeRow({ tag_color: '' })]);
    expect(result[0]?.tagColor).toBe('indigo');
  });

  it('tag_color が値あり → そのまま保持', () => {
    const result = transformEstimationAccuracy([makeRow({ tag_color: 'crimson' })]);
    expect(result[0]?.tagColor).toBe('crimson');
  });

  it('複数 row → 各 row が独立に変換される', () => {
    const result = transformEstimationAccuracy([
      makeRow({ tag_id: 'a', tag_color: 'red' }),
      makeRow({ tag_id: 'b', tag_color: '' }),
      makeRow({ tag_id: 'c', tag_color: 'green' }),
    ]);
    expect(result.map((r) => r.tagId)).toEqual(['a', 'b', 'c']);
    expect(result.map((r) => r.tagColor)).toEqual(['red', 'indigo', 'green']);
  });

  it('0 / 負数の minutes / count を保持する', () => {
    const result = transformEstimationAccuracy([
      makeRow({
        avg_planned_minutes: 0,
        avg_actual_minutes: 0,
        avg_deviation_minutes: -30,
        record_count: 0,
      }),
    ]);
    expect(result[0]).toMatchObject({
      avgPlannedMinutes: 0,
      avgActualMinutes: 0,
      avgDeviationMinutes: -30,
      recordCount: 0,
    });
  });
});

function makePlan(overrides: Partial<EstimationAccuracyPlanRow> = {}): EstimationAccuracyPlanRow {
  return { id: 'plan-1', tag_id: 'tag-1', planned_minutes: 60, ...overrides };
}

function makeRecord(
  overrides: Partial<EstimationAccuracyRecordRow> = {},
): EstimationAccuracyRecordRow {
  return { plan_id: 'plan-1', source: 'from_plan', minutes: 60, ...overrides };
}

const TAGS = new Map<string, EstimationAccuracyTagLookup>([
  ['tag-1', { name: 'Deep Work', color: 'blue' }],
]);

describe('aggregatePlanRecordEstimationAccuracy', () => {
  it('plan と紐づく非 auto_migrated record を実績として集計する（record_count>=2 のタグのみ）', () => {
    const plans = [makePlan({ id: 'p1' }), makePlan({ id: 'p2', planned_minutes: 30 })];
    const records = [
      makeRecord({ plan_id: 'p1', minutes: 90 }),
      makeRecord({ plan_id: 'p2', minutes: 20 }),
    ];

    const result = aggregatePlanRecordEstimationAccuracy(plans, records, TAGS);

    expect(result).toEqual([
      {
        tag_id: 'tag-1',
        tag_name: 'Deep Work',
        tag_color: 'blue',
        is_uncategorized: false,
        avg_planned_minutes: 45,
        avg_actual_minutes: 55,
        avg_deviation_minutes: 20,
        record_count: 2,
      },
    ]);
  });

  it('record_count が 1 件のタグは分母から除外する（旧 RPC の HAVING COUNT(*)>=2 を踏襲）', () => {
    const plans = [makePlan({ id: 'p1' })];
    const records = [makeRecord({ plan_id: 'p1' })];

    expect(aggregatePlanRecordEstimationAccuracy(plans, records, TAGS)).toEqual([]);
  });

  it('source=auto_migrated の record は分母から除外する（Step 2 決定 4）', () => {
    const plans = [makePlan({ id: 'p1' }), makePlan({ id: 'p2' })];
    const records = [
      makeRecord({ plan_id: 'p1', source: 'auto_migrated' }),
      makeRecord({ plan_id: 'p2', source: 'manual' }),
    ];

    // p1 に紐づく非 auto_migrated record が無いので実績なし扱い → record_count は p2 のみで 1 件 → 除外
    expect(aggregatePlanRecordEstimationAccuracy(plans, records, TAGS)).toEqual([]);
  });

  it('1 plan に複数 record（分割記録）は合算して 1 件の実績として扱う（1:N）', () => {
    const plans = [makePlan({ id: 'p1', planned_minutes: 60 }), makePlan({ id: 'p2' })];
    const records = [
      makeRecord({ plan_id: 'p1', minutes: 20 }),
      makeRecord({ plan_id: 'p1', minutes: 25, source: 'manual' }),
      makeRecord({ plan_id: 'p2', minutes: 60 }),
    ];

    const result = aggregatePlanRecordEstimationAccuracy(plans, records, TAGS);

    expect(result[0]?.record_count).toBe(2);
    expect(result[0]?.avg_actual_minutes).toBe((45 + 60) / 2);
  });

  it('紐づく record が無い plan は分母から除外する', () => {
    const plans = [makePlan({ id: 'p1' }), makePlan({ id: 'p2' })];
    const records = [makeRecord({ plan_id: 'p1' })];

    expect(aggregatePlanRecordEstimationAccuracy(plans, records, TAGS)).toEqual([]);
  });

  it('tag_id が null の plan は未分類バケットへ集計する（#1576: タグ削除時の未分類化を見積もり精度からも除外しない）', () => {
    const plans = [
      makePlan({ id: 'p1', tag_id: null, planned_minutes: 30 }),
      makePlan({ id: 'p2', tag_id: null, planned_minutes: 50 }),
    ];
    const records = [
      makeRecord({ plan_id: 'p1', minutes: 40 }),
      makeRecord({ plan_id: 'p2', minutes: 60 }),
    ];

    const result = aggregatePlanRecordEstimationAccuracy(plans, records, TAGS);

    expect(result).toEqual([
      {
        tag_id: null,
        tag_name: null,
        tag_color: null,
        is_uncategorized: true,
        avg_planned_minutes: 40,
        avg_actual_minutes: 50,
        avg_deviation_minutes: 10,
        record_count: 2,
      },
    ]);
  });

  it('tag_id はあるが tagsById に存在しない（削除済みタグ参照）は未分類バケットへ畳む（Time P/L の buildTagPL と同じ扱い）', () => {
    const plans = [
      makePlan({ id: 'p1', tag_id: 'deleted-tag-id' }),
      makePlan({ id: 'p2', tag_id: 'deleted-tag-id' }),
    ];
    const records = [makeRecord({ plan_id: 'p1' }), makeRecord({ plan_id: 'p2' })];

    const result = aggregatePlanRecordEstimationAccuracy(plans, records, TAGS);
    expect(result[0]).toMatchObject({
      tag_id: null,
      tag_name: null,
      tag_color: null,
      is_uncategorized: true,
    });
  });

  it('tag_id null と異なる削除済みタグ参照はすべて同じ未分類バケットへ合流する', () => {
    const plans = [
      makePlan({ id: 'p1', tag_id: null }),
      makePlan({ id: 'p2', tag_id: 'deleted-a' }),
      makePlan({ id: 'p3', tag_id: 'deleted-b' }),
    ];
    const records = [
      makeRecord({ plan_id: 'p1' }),
      makeRecord({ plan_id: 'p2' }),
      makeRecord({ plan_id: 'p3' }),
    ];

    const result = aggregatePlanRecordEstimationAccuracy(plans, records, TAGS);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ tag_id: null, is_uncategorized: true, record_count: 3 });
  });

  it('タグ付き plan と未分類 plan が混在する場合、それぞれ別バケットとして独立に集計する', () => {
    const plans = [
      makePlan({ id: 'p1', tag_id: 'tag-1' }),
      makePlan({ id: 'p2', tag_id: 'tag-1' }),
      makePlan({ id: 'p3', tag_id: null }),
      makePlan({ id: 'p4', tag_id: null }),
    ];
    const records = [
      makeRecord({ plan_id: 'p1' }),
      makeRecord({ plan_id: 'p2' }),
      makeRecord({ plan_id: 'p3' }),
      makeRecord({ plan_id: 'p4' }),
    ];

    const result = aggregatePlanRecordEstimationAccuracy(plans, records, TAGS);

    expect(result).toHaveLength(2);
    const tagged = result.find((row) => row.tag_id === 'tag-1');
    const uncategorized = result.find((row) => row.tag_id === null);
    expect(tagged).toMatchObject({
      tag_name: 'Deep Work',
      is_uncategorized: false,
      record_count: 2,
    });
    expect(uncategorized).toMatchObject({
      tag_name: null,
      is_uncategorized: true,
      record_count: 2,
    });
  });
});
