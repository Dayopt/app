import { describe, expect, it } from 'vitest';

import {
  aggregatePlanLogEstimationAccuracy,
  type EstimationAccuracyDbRow,
  type EstimationAccuracyLogRow,
  type EstimationAccuracyPlanRow,
  type EstimationAccuracyTagLookup,
  transformEstimationAccuracy,
} from '../estimation-accuracy';

function makeRow(overrides: Partial<EstimationAccuracyDbRow> = {}): EstimationAccuracyDbRow {
  return {
    tag_id: 'tag-1',
    tag_name: 'Deep Work',
    tag_color: 'blue',
    avg_planned_minutes: 60,
    avg_actual_minutes: 75,
    avg_deviation_minutes: 15,
    entry_count: 10,
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
      avgPlannedMinutes: 60,
      avgActualMinutes: 75,
      avgDeviationMinutes: 15,
      entryCount: 10,
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
        entry_count: 0,
      }),
    ]);
    expect(result[0]).toMatchObject({
      avgPlannedMinutes: 0,
      avgActualMinutes: 0,
      avgDeviationMinutes: -30,
      entryCount: 0,
    });
  });
});

function makePlan(overrides: Partial<EstimationAccuracyPlanRow> = {}): EstimationAccuracyPlanRow {
  return { id: 'plan-1', tag_id: 'tag-1', planned_minutes: 60, ...overrides };
}

function makeLog(overrides: Partial<EstimationAccuracyLogRow> = {}): EstimationAccuracyLogRow {
  return { plan_id: 'plan-1', source: 'from_plan', minutes: 60, ...overrides };
}

const TAGS = new Map<string, EstimationAccuracyTagLookup>([
  ['tag-1', { name: 'Deep Work', color: 'blue' }],
]);

describe('aggregatePlanLogEstimationAccuracy', () => {
  it('plan と紐づく非 auto_migrated log を実績として集計する（entry_count>=2 のタグのみ）', () => {
    const plans = [makePlan({ id: 'p1' }), makePlan({ id: 'p2', planned_minutes: 30 })];
    const logs = [makeLog({ plan_id: 'p1', minutes: 90 }), makeLog({ plan_id: 'p2', minutes: 20 })];

    const result = aggregatePlanLogEstimationAccuracy(plans, logs, TAGS);

    expect(result).toEqual([
      {
        tag_id: 'tag-1',
        tag_name: 'Deep Work',
        tag_color: 'blue',
        avg_planned_minutes: 45,
        avg_actual_minutes: 55,
        avg_deviation_minutes: 20,
        entry_count: 2,
      },
    ]);
  });

  it('entry_count が 1 件のタグは分母から除外する（旧 RPC の HAVING COUNT(*)>=2 を踏襲）', () => {
    const plans = [makePlan({ id: 'p1' })];
    const logs = [makeLog({ plan_id: 'p1' })];

    expect(aggregatePlanLogEstimationAccuracy(plans, logs, TAGS)).toEqual([]);
  });

  it('source=auto_migrated の log は分母から除外する（Step 2 決定 4）', () => {
    const plans = [makePlan({ id: 'p1' }), makePlan({ id: 'p2' })];
    const logs = [
      makeLog({ plan_id: 'p1', source: 'auto_migrated' }),
      makeLog({ plan_id: 'p2', source: 'manual' }),
    ];

    // p1 に紐づく非 auto_migrated log が無いので実績なし扱い → entry_count は p2 のみで 1 件 → 除外
    expect(aggregatePlanLogEstimationAccuracy(plans, logs, TAGS)).toEqual([]);
  });

  it('1 plan に複数 log（分割記録）は合算して 1 件の実績として扱う（1:N）', () => {
    const plans = [makePlan({ id: 'p1', planned_minutes: 60 }), makePlan({ id: 'p2' })];
    const logs = [
      makeLog({ plan_id: 'p1', minutes: 20 }),
      makeLog({ plan_id: 'p1', minutes: 25, source: 'manual' }),
      makeLog({ plan_id: 'p2', minutes: 60 }),
    ];

    const result = aggregatePlanLogEstimationAccuracy(plans, logs, TAGS);

    expect(result[0]?.entry_count).toBe(2);
    expect(result[0]?.avg_actual_minutes).toBe((45 + 60) / 2);
  });

  it('紐づく log が無い plan は分母から除外する', () => {
    const plans = [makePlan({ id: 'p1' }), makePlan({ id: 'p2' })];
    const logs = [makeLog({ plan_id: 'p1' })];

    expect(aggregatePlanLogEstimationAccuracy(plans, logs, TAGS)).toEqual([]);
  });

  it('tag_id が null の plan は無視する', () => {
    const plans = [makePlan({ id: 'p1', tag_id: null }), makePlan({ id: 'p2' })];
    const logs = [makeLog({ plan_id: 'p1' }), makeLog({ plan_id: 'p2' })];

    // tag_id null の p1 を除くと tag-1 は 1 件のみ → HAVING で除外
    expect(aggregatePlanLogEstimationAccuracy(plans, logs, TAGS)).toEqual([]);
  });

  it('未知の tagId は空文字にフォールバックする', () => {
    const plans = [
      makePlan({ id: 'p1', tag_id: 'unknown' }),
      makePlan({ id: 'p2', tag_id: 'unknown' }),
    ];
    const logs = [makeLog({ plan_id: 'p1' }), makeLog({ plan_id: 'p2' })];

    const result = aggregatePlanLogEstimationAccuracy(plans, logs, TAGS);
    expect(result[0]).toMatchObject({ tag_id: 'unknown', tag_name: '', tag_color: '' });
  });
});
