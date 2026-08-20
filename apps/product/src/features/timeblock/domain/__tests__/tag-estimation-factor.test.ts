import { describe, expect, it } from 'vitest';

import {
  aggregateActivityEstimationFactors,
  MIN_ESTIMATION_SAMPLE_COUNT,
  projectActualMinutes,
  type ActivityEstimationPlanRow,
  type ActivityEstimationRecordRow,
} from '../tag-estimation-factor';

function plan(
  overrides: Partial<ActivityEstimationPlanRow> & { id: string },
): ActivityEstimationPlanRow {
  return {
    activity_id: 'activity-a',
    planned_minutes: 60,
    is_skipped: false,
    ...overrides,
  };
}

function record(
  overrides: Partial<ActivityEstimationRecordRow> & { plan_id: string },
): ActivityEstimationRecordRow {
  return {
    source: 'from_plan',
    minutes: 60,
    ...overrides,
  };
}

describe('aggregateActivityEstimationFactors', () => {
  it('n >= 3 の activity だけ返す（ADR-026 の沈黙閾値）', () => {
    const plans = [plan({ id: 'p1' }), plan({ id: 'p2' })];
    const records = [record({ plan_id: 'p1' }), record({ plan_id: 'p2' })];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([]);

    const third = {
      plans: [...plans, plan({ id: 'p3' })],
      records: [...records, record({ plan_id: 'p3' })],
    };
    expect(aggregateActivityEstimationFactors(third.plans, third.records)).toEqual([
      { activityId: 'activity-a', factor: 1, sampleCount: 3 },
    ]);
  });

  it('沈黙閾値は 3 件', () => {
    expect(MIN_ESTIMATION_SAMPLE_COUNT).toBe(3);
  });

  it('平均ではなく中央値を取る（1 回の外れ値に引きずられない）', () => {
    // 比: 1.0 / 1.0 / 10.0 → 平均 4.0、中央値 1.0
    const plans = [plan({ id: 'p1' }), plan({ id: 'p2' }), plan({ id: 'p3' })];
    const records = [
      record({ plan_id: 'p1', minutes: 60 }),
      record({ plan_id: 'p2', minutes: 60 }),
      record({ plan_id: 'p3', minutes: 600 }),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1, sampleCount: 3 },
    ]);
  });

  it('偶数件は中央 2 件の平均を取る', () => {
    // 比: 1.0 / 1.0 / 2.0 / 2.0 → 中央 2 件は 1.0 と 2.0 → 1.5
    const plans = ['p1', 'p2', 'p3', 'p4'].map((id) => plan({ id }));
    const records = [
      record({ plan_id: 'p1', minutes: 60 }),
      record({ plan_id: 'p2', minutes: 60 }),
      record({ plan_id: 'p3', minutes: 120 }),
      record({ plan_id: 'p4', minutes: 120 }),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1.5, sampleCount: 4 },
    ]);
  });

  it('1 Plan : N Record は合算して 1 つの比にする', () => {
    // p1 は 30 分 + 30 分 = 60 分の実績 → 比 1.0（2 件と数えない）
    const plans = [plan({ id: 'p1' }), plan({ id: 'p2' }), plan({ id: 'p3' })];
    const records = [
      record({ plan_id: 'p1', minutes: 30 }),
      record({ plan_id: 'p1', minutes: 30 }),
      record({ plan_id: 'p2', minutes: 60 }),
      record({ plan_id: 'p3', minutes: 60 }),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1, sampleCount: 3 },
    ]);
  });

  it('auto_migrated の Record は分子から除外する', () => {
    // p3 の実績が auto_migrated だけ → p3 ごと分母から外れ、n=2 で沈黙する
    const plans = [plan({ id: 'p1' }), plan({ id: 'p2' }), plan({ id: 'p3' })];
    const records = [
      record({ plan_id: 'p1' }),
      record({ plan_id: 'p2' }),
      record({ plan_id: 'p3', source: 'auto_migrated' }),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([]);
  });

  it('auto_migrated が混在する Plan は残りの Record だけで比を作る', () => {
    const plans = [plan({ id: 'p1' }), plan({ id: 'p2' }), plan({ id: 'p3' })];
    const records = [
      record({ plan_id: 'p1' }),
      record({ plan_id: 'p2' }),
      record({ plan_id: 'p3', minutes: 60 }),
      record({ plan_id: 'p3', minutes: 600, source: 'auto_migrated' }),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1, sampleCount: 3 },
    ]);
  });

  it('skip した Plan は分母から除外する', () => {
    const plans = [
      plan({ id: 'p1' }),
      plan({ id: 'p2' }),
      plan({ id: 'p3', is_skipped: true }),
      plan({ id: 'p4', is_skipped: true }),
    ];
    const records = ['p1', 'p2', 'p3', 'p4'].map((plan_id) => record({ plan_id }));

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([]);
  });

  it('記録が 1 件も無い Plan は分母から除外する（0 実績として潰さない）', () => {
    const plans = ['p1', 'p2', 'p3', 'p4'].map((id) => plan({ id }));
    const records = [record({ plan_id: 'p1' }), record({ plan_id: 'p2' })];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([]);
  });

  it('planned_minutes が 0 以下の Plan は比が定義できないので除外する', () => {
    const plans = [
      plan({ id: 'p1' }),
      plan({ id: 'p2' }),
      plan({ id: 'p3' }),
      plan({ id: 'p4', planned_minutes: 0 }),
    ];
    const records = ['p1', 'p2', 'p3', 'p4'].map((plan_id) => record({ plan_id }));

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1, sampleCount: 3 },
    ]);
  });

  it('activity_id が null の Plan は返さない（作成時に引くキーが無い）', () => {
    const plans = ['p1', 'p2', 'p3'].map((id) => plan({ id, activity_id: null }));
    const records = ['p1', 'p2', 'p3'].map((plan_id) => record({ plan_id }));

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([]);
  });

  it('plan_id を持たない Record（予定外の記録）は分子に入れない', () => {
    const plans = ['p1', 'p2', 'p3'].map((id) => plan({ id }));
    const records = [
      ...['p1', 'p2', 'p3'].map((plan_id) => record({ plan_id })),
      record({ plan_id: null as unknown as string, minutes: 600 }),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1, sampleCount: 3 },
    ]);
  });

  it('Plan 側の activity で束ねる（Record 側の activity は見ない）', () => {
    const plans = [
      ...['p1', 'p2', 'p3'].map((id) => plan({ id, activity_id: 'activity-a' })),
      ...['p4', 'p5', 'p6'].map((id) =>
        plan({ id, activity_id: 'activity-b', planned_minutes: 30 }),
      ),
    ];
    const records = [
      ...['p1', 'p2', 'p3'].map((plan_id) => record({ plan_id, minutes: 90 })),
      ...['p4', 'p5', 'p6'].map((plan_id) => record({ plan_id, minutes: 30 })),
    ];

    expect(aggregateActivityEstimationFactors(plans, records)).toEqual([
      { activityId: 'activity-a', factor: 1.5, sampleCount: 3 },
      { activityId: 'activity-b', factor: 1, sampleCount: 3 },
    ]);
  });

  it('sampleCount 降順・同数は activityId 昇順で安定ソートする', () => {
    const plans = [
      ...['a1', 'a2', 'a3'].map((id) => plan({ id, activity_id: 'activity-b' })),
      ...['b1', 'b2', 'b3'].map((id) => plan({ id, activity_id: 'activity-a' })),
      ...['c1', 'c2', 'c3', 'c4'].map((id) => plan({ id, activity_id: 'activity-c' })),
    ];
    const records = plans.map((p) => record({ plan_id: p.id }));

    expect(
      aggregateActivityEstimationFactors(plans, records).map((entry) => entry.activityId),
    ).toEqual(['activity-c', 'activity-a', 'activity-b']);
  });

  it('空入力で空配列を返す', () => {
    expect(aggregateActivityEstimationFactors([], [])).toEqual([]);
  });
});

describe('projectActualMinutes', () => {
  it('係数を draft の予定時間に掛けて 5 分刻みに丸める', () => {
    expect(projectActualMinutes(1.5, 30)).toBe(45);
    expect(projectActualMinutes(1, 60)).toBe(60);
    expect(projectActualMinutes(0.5, 60)).toBe(30);
  });

  it('端数は最も近い 5 分へ寄せる', () => {
    // 1.1 * 30 = 33 → 35
    expect(projectActualMinutes(1.1, 30)).toBe(35);
    // 1.05 * 30 = 31.5 → 30
    expect(projectActualMinutes(1.05, 30)).toBe(30);
  });

  it('0 分と表示しないよう下限を 5 分にする', () => {
    expect(projectActualMinutes(0.01, 15)).toBe(5);
    expect(projectActualMinutes(0, 60)).toBe(5);
  });
});
