import { describe, expect, it } from 'vitest';

import { aggregateByActivity, type ActivityAxisDurationRow } from './activity-axis-aggregation';

const ACTIVITY_API = 'activity-api';
const ACTIVITY_ENGLISH = 'activity-english';
const ACTIVITY_RUN = 'activity-run';

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
