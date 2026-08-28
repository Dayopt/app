import { describe, expect, it } from 'vitest';

import {
  buildActivityPL,
  buildCategoryPL,
  buildSegmentTotals,
  type ActivityLookupRow,
  type AxisPlanRow,
  type AxisRecordRow,
  type CategoryLookupRow,
} from './statistics-activity-axis-builders';

const ACTIVITY_API = 'activity-api';
const ACTIVITY_ENGLISH = 'activity-english';
const ACTIVITY_RUN = 'activity-run';
const CATEGORY_WORK = 'category-work';
const CATEGORY_LEARN = 'category-learn';

const activitiesById = new Map<string, ActivityLookupRow>([
  [ACTIVITY_API, { id: ACTIVITY_API, name: 'API', category_id: CATEGORY_WORK }],
  [ACTIVITY_ENGLISH, { id: ACTIVITY_ENGLISH, name: '英語', category_id: CATEGORY_LEARN }],
  // カテゴリー未所属
  [ACTIVITY_RUN, { id: ACTIVITY_RUN, name: 'ランニング', category_id: null }],
]);

const categoriesById = new Map<string, CategoryLookupRow>([
  [CATEGORY_WORK, { id: CATEGORY_WORK, name: '仕事', color: 'blue', icon: 'briefcase' }],
  // 実 schema では color が nullable
  [CATEGORY_LEARN, { id: CATEGORY_LEARN, name: '学習', color: null, icon: null }],
]);

/** `minutes` 分のブロックを作る（開始は固定、終了で長さを決める）。 */
function plan(activityId: string | null, minutes: number, id = `plan-${activityId}-${minutes}`) {
  return {
    id,
    activity_id: activityId,
    start_at: '2026-08-18T00:00:00.000Z',
    end_at: new Date(Date.UTC(2026, 7, 18, 0, minutes)).toISOString(),
  } satisfies AxisPlanRow;
}

function record(
  activityId: string | null,
  minutes: number,
  id = `record-${activityId}-${minutes}`,
) {
  return {
    id,
    activity_id: activityId,
    plan_id: null,
    start_at: '2026-08-18T00:00:00.000Z',
    end_at: new Date(Date.UTC(2026, 7, 18, 0, minutes)).toISOString(),
  } satisfies AxisRecordRow;
}

describe('buildActivityPL', () => {
  it('アクティビティ名とカテゴリーの色・アイコンを載せて返す', () => {
    const result = buildActivityPL(
      [plan(ACTIVITY_API, 120)],
      [record(ACTIVITY_API, 90)],
      activitiesById,
      categoriesById,
    );

    expect(result).toEqual([
      {
        activityId: ACTIVITY_API,
        activityName: 'API',
        categoryId: CATEGORY_WORK,
        categoryColor: 'blue',
        categoryIcon: 'briefcase',
        budgetMinutes: 120,
        actualMinutes: 90,
        isPlanned: true,
        isNoActivity: false,
      },
    ]);
  });

  it('色を持たないカテゴリーでも null のまま落ちない', () => {
    const result = buildActivityPL(
      [plan(ACTIVITY_ENGLISH, 30)],
      [],
      activitiesById,
      categoriesById,
    );

    expect(result[0]).toMatchObject({
      activityName: '英語',
      categoryId: CATEGORY_LEARN,
      categoryColor: null,
      categoryIcon: null,
    });
  });

  it('アクティビティなしを isNoActivity の行として返す', () => {
    const result = buildActivityPL(
      [plan(null, 45)],
      [record(null, 20)],
      activitiesById,
      categoriesById,
    );

    expect(result).toEqual([
      {
        activityId: null,
        activityName: null,
        categoryId: null,
        categoryColor: null,
        categoryIcon: null,
        budgetMinutes: 45,
        actualMinutes: 20,
        isPlanned: true,
        isNoActivity: true,
      },
    ]);
  });

  it('actualMinutes の降順で返す', () => {
    const result = buildActivityPL(
      [],
      [record(ACTIVITY_API, 30), record(ACTIVITY_ENGLISH, 90), record(ACTIVITY_RUN, 60)],
      activitiesById,
      categoriesById,
    );

    expect(result.map((r) => r.actualMinutes)).toEqual([90, 60, 30]);
  });

  it('不変条件: Σ(各アクティビティ) + アクティビティなし = 全ブロック時間', () => {
    const plans = [plan(ACTIVITY_API, 120), plan(ACTIVITY_RUN, 40), plan(null, 45)];
    const records = [
      record(ACTIVITY_ENGLISH, 60),
      record(null, 20),
      // 削除済みアクティビティ参照も落とさない
      record('activity-deleted', 15),
    ];

    const result = buildActivityPL(plans, records, activitiesById, categoriesById);

    expect(result.reduce((s, r) => s + r.budgetMinutes, 0)).toBe(120 + 40 + 45);
    expect(result.reduce((s, r) => s + r.actualMinutes, 0)).toBe(60 + 20 + 15);
  });
});

describe('buildCategoryPL', () => {
  it('カテゴリー未所属のアクティビティとアクティビティなしを同一の未分類へ畳む', () => {
    const result = buildCategoryPL(
      [plan(ACTIVITY_RUN, 40), plan(null, 30)],
      [record(ACTIVITY_RUN, 25)],
      activitiesById,
      categoriesById,
    );

    const uncategorized = result.filter((r) => r.isUncategorized);
    expect(uncategorized).toHaveLength(1);
    expect(uncategorized[0]).toMatchObject({
      categoryId: null,
      categoryName: null,
      budgetMinutes: 70,
      actualMinutes: 25,
    });
  });

  it('不変条件: Σ(各カテゴリー) + 未分類 = 全ブロック時間', () => {
    const plans = [
      plan(ACTIVITY_API, 120),
      plan(ACTIVITY_ENGLISH, 30),
      plan(ACTIVITY_RUN, 40),
      plan(null, 45),
      plan('activity-deleted', 10),
    ];
    const records = [record(ACTIVITY_API, 90), record(null, 20)];

    const result = buildCategoryPL(plans, records, activitiesById, categoriesById);

    expect(result.reduce((s, r) => s + r.budgetMinutes, 0)).toBe(120 + 30 + 40 + 45 + 10);
    expect(result.reduce((s, r) => s + r.actualMinutes, 0)).toBe(90 + 20);
  });

  it('不変条件: アクティビティ軸とカテゴリー軸の総和が一致する', () => {
    const plans = [plan(ACTIVITY_API, 120), plan(ACTIVITY_RUN, 40), plan(null, 45)];
    const records = [record(ACTIVITY_ENGLISH, 60), record(null, 20)];

    const byActivity = buildActivityPL(plans, records, activitiesById, categoriesById);
    const byCategory = buildCategoryPL(plans, records, activitiesById, categoriesById);

    expect(byCategory.reduce((s, r) => s + r.actualMinutes, 0)).toBe(
      byActivity.reduce((s, r) => s + r.actualMinutes, 0),
    );
  });
});

describe('buildSegmentTotals', () => {
  const segments = [
    { id: 'segment-deep', name: '深い仕事', activityIds: [ACTIVITY_API, ACTIVITY_ENGLISH] },
    { id: 'segment-solo', name: '単独作業', activityIds: [ACTIVITY_API] },
  ];

  it('セグメント名を載せて合算する', () => {
    const result = buildSegmentTotals(
      [plan(ACTIVITY_API, 120), plan(ACTIVITY_ENGLISH, 30)],
      [record(ACTIVITY_API, 90)],
      activitiesById,
      segments,
    );

    expect(result).toEqual([
      {
        segmentId: 'segment-deep',
        segmentName: '深い仕事',
        budgetMinutes: 150,
        actualMinutes: 90,
      },
      {
        segmentId: 'segment-solo',
        segmentName: '単独作業',
        budgetMinutes: 120,
        actualMinutes: 90,
      },
    ]);
  });

  it('同じブロックが複数セグメントへ重複して数えられる', () => {
    const result = buildSegmentTotals([plan(ACTIVITY_API, 120)], [], activitiesById, segments);

    // 母数 120 に対し合計 240。分割軸ではないので合計に意味が無いことの実体
    expect(result.reduce((s, r) => s + r.budgetMinutes, 0)).toBe(240);
  });

  it('戻り値に合計・比率を持たない（円グラフを書けなくするため）', () => {
    const result = buildSegmentTotals([plan(ACTIVITY_API, 120)], [], activitiesById, segments);

    for (const row of result) {
      expect(Object.keys(row).sort()).toEqual([
        'actualMinutes',
        'budgetMinutes',
        'segmentId',
        'segmentName',
      ]);
    }
  });
});
