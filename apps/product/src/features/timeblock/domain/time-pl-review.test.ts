import { describe, expect, it } from 'vitest';

import { aggregateByActivity } from './activity-axis-aggregation';
import { deriveTimePLReview, type TimePLReviewSourceRow } from './time-pl-review';

const TAG_A = '00000000-0000-4000-8000-000000000001';
const TAG_B = '00000000-0000-4000-8000-000000000002';
const TAG_C = '00000000-0000-4000-8000-000000000003';

function row(activityId: string | null, minutes: number, offsetMinutes = 0): TimePLReviewSourceRow {
  const start = new Date(Date.UTC(2026, 6, 24, 0, offsetMinutes));
  return {
    activityId,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
  };
}

describe('deriveTimePLReview', () => {
  it('Review UIとMCPが共有するtag集計でpresenceと0.1分丸めを保持する', () => {
    expect(
      aggregateByActivity(
        [{ activityId: TAG_A, minutes: 0.04 }],
        [
          { activityId: TAG_A, minutes: 0.06 },
          { activityId: TAG_B, minutes: 45 },
        ],
      ),
    ).toEqual([
      {
        activityId: TAG_A,
        plannedMinutes: 0,
        recordedMinutes: 0.1,
        hasPlan: true,
        hasRecord: true,
      },
      {
        activityId: TAG_B,
        plannedMinutes: 0,
        recordedMinutes: 45,
        hasPlan: false,
        hasRecord: true,
      },
    ]);
  });

  it('Planをbudget、Recordをactualとしてtag別・summary・accuracy・signalを導出する', () => {
    const result = deriveTimePLReview(
      [row(TAG_A, 120), row(TAG_B, 60)],
      [row(TAG_A, 90), row(TAG_B, 90), row(TAG_C, 45)],
    );

    expect(result).toEqual({
      hasData: true,
      summary: {
        plannedMinutes: 180,
        recordedMinutes: 225,
        varianceMinutes: -45,
      },
      accuracy: { rate: 0.75, status: 'fair' },
      activities: [
        {
          activityId: TAG_A,
          isNoActivity: false,
          plannedMinutes: 120,
          recordedMinutes: 90,
          varianceMinutes: 30,
          variancePercent: 25,
        },
        {
          activityId: TAG_B,
          isNoActivity: false,
          plannedMinutes: 60,
          recordedMinutes: 90,
          varianceMinutes: -30,
          variancePercent: -50,
        },
        {
          activityId: TAG_C,
          isNoActivity: false,
          plannedMinutes: 0,
          recordedMinutes: 45,
          varianceMinutes: -45,
          variancePercent: null,
        },
      ],
      signals: [
        { code: 'plan_accuracy', rate: 0.75, status: 'fair' },
        {
          code: 'largest_activity_variance',
          activityId: TAG_C,
          isNoActivity: false,
          direction: 'recorded_more_than_planned',
          absoluteMinutes: 45,
        },
      ],
    });
  });

  it('アクティビティなしのPlan / Recordを単一バケットへ畳んでsummaryとaccuracyに含める', () => {
    const result = deriveTimePLReview(
      [row(TAG_A, 120), row(null, 30), row(null, 30, 60)],
      [row(TAG_A, 90), row(null, 90)],
    );

    expect(result.activities).toEqual([
      {
        activityId: TAG_A,
        isNoActivity: false,
        plannedMinutes: 120,
        recordedMinutes: 90,
        varianceMinutes: 30,
        variancePercent: 25,
      },
      {
        activityId: null,
        isNoActivity: true,
        plannedMinutes: 60,
        recordedMinutes: 90,
        varianceMinutes: -30,
        variancePercent: -50,
      },
    ]);
    // アクティビティなしを除外していた頃は planned 120 / recorded 90 に目減りしていた
    expect(result.summary).toEqual({
      plannedMinutes: 180,
      recordedMinutes: 180,
      varianceMinutes: 0,
    });
    expect(result.accuracy).toEqual({ rate: 1, status: 'excellent' });
  });

  it('アクティビティなししか無くてもhasDataを立てて空reviewへ落とさない', () => {
    const result = deriveTimePLReview([row(null, 60)], [row(null, 30)]);

    expect(result).toEqual({
      hasData: true,
      summary: { plannedMinutes: 60, recordedMinutes: 30, varianceMinutes: 30 },
      accuracy: { rate: 0.5, status: 'poor' },
      activities: [
        {
          activityId: null,
          isNoActivity: true,
          plannedMinutes: 60,
          recordedMinutes: 30,
          varianceMinutes: 30,
          variancePercent: 50,
        },
      ],
      signals: [
        { code: 'plan_accuracy', rate: 0.5, status: 'poor' },
        {
          code: 'largest_activity_variance',
          activityId: null,
          isNoActivity: true,
          direction: 'recorded_less_than_planned',
          absoluteMinutes: 30,
        },
      ],
    });
  });

  it('アクティビティなしが最大varianceでもactivityIdをnullのままsignalへ出す', () => {
    const result = deriveTimePLReview([row(TAG_A, 60), row(null, 120)], [row(TAG_A, 50)]);

    expect(result.signals).toContainEqual({
      code: 'largest_activity_variance',
      activityId: null,
      isNoActivity: true,
      direction: 'recorded_less_than_planned',
      absoluteMinutes: 120,
    });
  });

  it('アクティビティなしは同点tag のtie-breakでだけ末尾へ回す', () => {
    const result = deriveTimePLReview([row(null, 60), row(TAG_A, 60), row(TAG_C, 60)], []);

    expect(result.activities.map(({ activityId }) => activityId)).toEqual([TAG_A, TAG_C, null]);
  });

  it('tagを0.1分へ丸めてからsummaryを作り浮動小数の端数を返さない', () => {
    const result = deriveTimePLReview([row(TAG_A, 0.06), row(TAG_B, 0.06)], []);

    expect(result.activities.map(({ plannedMinutes }) => plannedMinutes)).toEqual([0.1, 0.1]);
    expect(result.summary).toEqual({
      plannedMinutes: 0.2,
      recordedMinutes: 0,
      varianceMinutes: 0.2,
    });
    expect(JSON.stringify(result)).not.toContain('00000000000000004');
  });

  it('丸め後0分でもPlan存在を保持しvariancePercentとhasDataを失わない', () => {
    const result = deriveTimePLReview([row(TAG_A, 1 / 60)], []);

    expect(result).toMatchObject({
      hasData: true,
      accuracy: { rate: 1, status: 'excellent' },
      activities: [
        {
          activityId: TAG_A,
          isNoActivity: false,
          plannedMinutes: 0,
          recordedMinutes: 0,
          varianceMinutes: 0,
          variancePercent: 0,
        },
      ],
      signals: [{ code: 'plan_accuracy', rate: 1, status: 'excellent' }],
    });
  });

  it('同じ絶対varianceはactivityIdで決定し相殺時もlargest signalを返す', () => {
    const result = deriveTimePLReview(
      [row(TAG_B, 30), row(TAG_A, 60)],
      [row(TAG_B, 60), row(TAG_A, 30)],
    );

    expect(result.summary.varianceMinutes).toBe(0);
    expect(result.accuracy).toEqual({ rate: 1, status: 'excellent' });
    expect(result.signals).toEqual([
      { code: 'plan_accuracy', rate: 1, status: 'excellent' },
      {
        code: 'largest_activity_variance',
        activityId: TAG_A,
        isNoActivity: false,
        direction: 'recorded_less_than_planned',
        absoluteMinutes: 30,
      },
    ]);
  });

  it('公開rateだけを4桁へ丸めstatusはcanonicalな丸め前thresholdを保持する', () => {
    const result = deriveTimePLReview([row(TAG_A, 10_000)], [row(TAG_A, 9_499.6)]);

    expect(result.accuracy).toEqual({ rate: 0.95, status: 'good' });
    expect(result.signals[0]).toEqual({
      code: 'plan_accuracy',
      rate: 0.95,
      status: 'good',
    });
  });

  it('対象rowがなければ明示的なempty reviewを返す', () => {
    expect(deriveTimePLReview([], [])).toEqual({
      hasData: false,
      summary: {
        plannedMinutes: 0,
        recordedMinutes: 0,
        varianceMinutes: 0,
      },
      accuracy: null,
      activities: [],
      signals: [],
    });
  });
});
