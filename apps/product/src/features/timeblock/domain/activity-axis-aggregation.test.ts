import { describe, expect, it } from 'vitest';

import {
  aggregateByActivity,
  aggregateByCategory,
  aggregateBySegment,
  type ActivityAxisDurationRow,
} from './activity-axis-aggregation';

const ACTIVITY_API = 'activity-api';
const ACTIVITY_ENGLISH = 'activity-english';
const ACTIVITY_RUN = 'activity-run';
const CATEGORY_WORK = 'category-work';
const CATEGORY_LEARN = 'category-learn';

function row(activityId: string | null, minutes: number): ActivityAxisDurationRow {
  return { activityId, minutes };
}

/** 全ブロック時間（軸によらず不変な母数）。 */
function totalMinutes(rows: ReadonlyArray<ActivityAxisDurationRow>): number {
  return rows.reduce((sum, r) => sum + r.minutes, 0);
}

describe('aggregateByActivity', () => {
  it('アクティビティ別に planned / recorded を加算する', () => {
    const result = aggregateByActivity(
      [row(ACTIVITY_API, 120), row(ACTIVITY_ENGLISH, 30)],
      [row(ACTIVITY_API, 90)],
    );

    expect(result).toEqual(
      expect.arrayContaining([
        {
          activityId: ACTIVITY_API,
          plannedMinutes: 120,
          recordedMinutes: 90,
          hasPlan: true,
          hasRecord: true,
        },
        {
          activityId: ACTIVITY_ENGLISH,
          plannedMinutes: 30,
          recordedMinutes: 0,
          hasPlan: true,
          hasRecord: false,
        },
      ]),
    );
  });

  it('アクティビティ未設定のブロックを単一の「アクティビティなし」バケットへ畳む', () => {
    const result = aggregateByActivity([row(null, 30), row(null, 45)], [row(null, 20)]);

    const noActivity = result.filter((r) => r.activityId === null);
    expect(noActivity).toHaveLength(1);
    expect(noActivity[0]).toEqual({
      activityId: null,
      plannedMinutes: 75,
      recordedMinutes: 20,
      hasPlan: true,
      hasRecord: true,
    });
  });

  // 不変条件（#2162）: これが成立することが「集計が濁らない」の実体。
  it('不変条件: Σ(各アクティビティ) + アクティビティなし = 全ブロック時間', () => {
    const plans = [row(ACTIVITY_API, 120), row(ACTIVITY_ENGLISH, 30), row(null, 45)];
    const records = [row(ACTIVITY_API, 90), row(null, 20), row(ACTIVITY_RUN, 15)];

    const result = aggregateByActivity(plans, records);

    // 残余バケットを含めた総和が、入力の総和と一致する（1 分たりとも落ちない）
    expect(result.reduce((s, r) => s + r.plannedMinutes, 0)).toBe(totalMinutes(plans));
    expect(result.reduce((s, r) => s + r.recordedMinutes, 0)).toBe(totalMinutes(records));
  });
});

describe('aggregateByCategory', () => {
  const categoryIdByActivityId = new Map<string, string | null>([
    [ACTIVITY_API, CATEGORY_WORK],
    [ACTIVITY_ENGLISH, CATEGORY_LEARN],
    // カテゴリー未所属のアクティビティ
    [ACTIVITY_RUN, null],
  ]);

  it('アクティビティをカテゴリーへ畳んで加算する', () => {
    const result = aggregateByCategory(
      [row(ACTIVITY_API, 120), row(ACTIVITY_ENGLISH, 30)],
      [row(ACTIVITY_API, 90)],
      categoryIdByActivityId,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        {
          categoryId: CATEGORY_WORK,
          plannedMinutes: 120,
          recordedMinutes: 90,
          hasPlan: true,
          hasRecord: true,
        },
        {
          categoryId: CATEGORY_LEARN,
          plannedMinutes: 30,
          recordedMinutes: 0,
          hasPlan: true,
          hasRecord: false,
        },
      ]),
    );
  });

  it('カテゴリー未所属のアクティビティとアクティビティなしのブロックを同一の「未分類」へ畳む', () => {
    const result = aggregateByCategory(
      // ACTIVITY_RUN はカテゴリー未所属、null はアクティビティなし
      [row(ACTIVITY_RUN, 40), row(null, 30)],
      [row(ACTIVITY_RUN, 25)],
      categoryIdByActivityId,
    );

    const uncategorized = result.filter((r) => r.categoryId === null);
    // 2 概念を 1 バケットへ畳む（ユーザーには「どのカテゴリーにも入っていない時間」の 1 概念）
    expect(uncategorized).toHaveLength(1);
    expect(uncategorized[0]).toEqual({
      categoryId: null,
      plannedMinutes: 70,
      recordedMinutes: 25,
      hasPlan: true,
      hasRecord: true,
    });
  });

  it('削除済みアクティビティを参照する行も未分類へ落として集計から落とさない', () => {
    const plans = [row('activity-deleted', 50)];

    const result = aggregateByCategory(plans, [], categoryIdByActivityId);

    expect(result).toEqual([
      {
        categoryId: null,
        plannedMinutes: 50,
        recordedMinutes: 0,
        hasPlan: true,
        hasRecord: false,
      },
    ]);
  });

  // 不変条件（#2162）
  it('不変条件: Σ(各カテゴリー) + 未分類 = 全ブロック時間', () => {
    const plans = [
      row(ACTIVITY_API, 120),
      row(ACTIVITY_ENGLISH, 30),
      row(ACTIVITY_RUN, 40), // カテゴリー未所属
      row(null, 45), // アクティビティなし
      row('activity-deleted', 10), // 削除済み参照
    ];
    const records = [row(ACTIVITY_API, 90), row(null, 20)];

    const result = aggregateByCategory(plans, records, categoryIdByActivityId);

    expect(result.reduce((s, r) => s + r.plannedMinutes, 0)).toBe(totalMinutes(plans));
    expect(result.reduce((s, r) => s + r.recordedMinutes, 0)).toBe(totalMinutes(records));
  });

  it('不変条件: アクティビティ軸とカテゴリー軸の総和が一致する（母数は軸によらない）', () => {
    const plans = [row(ACTIVITY_API, 120), row(ACTIVITY_RUN, 40), row(null, 45)];
    const records = [row(ACTIVITY_ENGLISH, 60), row(null, 20)];

    const byActivity = aggregateByActivity(plans, records);
    const byCategory = aggregateByCategory(plans, records, categoryIdByActivityId);

    expect(byCategory.reduce((s, r) => s + r.plannedMinutes, 0)).toBe(
      byActivity.reduce((s, r) => s + r.plannedMinutes, 0),
    );
    expect(byCategory.reduce((s, r) => s + r.recordedMinutes, 0)).toBe(
      byActivity.reduce((s, r) => s + r.recordedMinutes, 0),
    );
  });
});

describe('aggregateBySegment', () => {
  const segments = new Map<string, ReadonlySet<string>>([
    ['segment-deep-work', new Set([ACTIVITY_API, ACTIVITY_ENGLISH])],
    ['segment-solo', new Set([ACTIVITY_API])],
    ['segment-empty', new Set<string>()],
  ]);

  it('セグメントに含まれるアクティビティの時間を合算する', () => {
    const result = aggregateBySegment(
      [row(ACTIVITY_API, 120), row(ACTIVITY_ENGLISH, 30), row(ACTIVITY_RUN, 40)],
      [row(ACTIVITY_API, 90)],
      segments,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        { segmentId: 'segment-deep-work', plannedMinutes: 150, recordedMinutes: 90 },
        { segmentId: 'segment-solo', plannedMinutes: 120, recordedMinutes: 90 },
      ]),
    );
  });

  // セグメントが「所属」ではなく「横断参照」であることの実体。
  it('同じブロックが複数セグメントへ重複して数えられる（合計は母数を超えうる）', () => {
    const plans = [row(ACTIVITY_API, 120)];

    const result = aggregateBySegment(plans, [], segments);

    // deep-work と solo の両方が同じ 120 分を数える
    const sum = result.reduce((s, r) => s + r.plannedMinutes, 0);
    expect(sum).toBe(240);
    expect(sum).toBeGreaterThan(totalMinutes(plans));
  });

  it('空のセグメントも 0 分の行として返す（過去比較のため行ごと消さない）', () => {
    const result = aggregateBySegment([row(ACTIVITY_API, 120)], [], segments);

    expect(result).toContainEqual({
      segmentId: 'segment-empty',
      plannedMinutes: 0,
      recordedMinutes: 0,
    });
  });

  it('どのセグメントにも入らない時間の残余バケットを返さない', () => {
    const result = aggregateBySegment([row(ACTIVITY_RUN, 40), row(null, 30)], [], segments);

    // 分割軸ではないので「残余」という概念が成立しない
    expect(result.map((r) => r.segmentId).sort()).toEqual([
      'segment-deep-work',
      'segment-empty',
      'segment-solo',
    ]);
    expect(result.every((r) => r.plannedMinutes === 0)).toBe(true);
  });

  // 表示規律を型で守っていることの確認（円グラフ・「合計 100%」を書けなくする）
  it('戻り値に total / share を持たない', () => {
    const result = aggregateBySegment([row(ACTIVITY_API, 120)], [], segments);

    for (const aggregate of result) {
      expect(Object.keys(aggregate).sort()).toEqual([
        'plannedMinutes',
        'recordedMinutes',
        'segmentId',
      ]);
    }
  });
});
