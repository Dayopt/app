import { computePlanAccuracy, computePlanVariance, type PlanAccuracyStatus } from '@dayopt/domain';

import { aggregateTimePLTags } from './time-pl-tag-aggregation';

export interface TimePLReviewSourceRow {
  tagId: string;
  startAt: string;
  endAt: string;
}

export interface TimePLReviewTag {
  tagId: string;
  plannedMinutes: number;
  recordedMinutes: number;
  varianceMinutes: number;
  variancePercent: number | null;
}

export type TimePLReviewSignal =
  | {
      code: 'plan_accuracy';
      rate: number;
      status: PlanAccuracyStatus;
    }
  | {
      code: 'largest_tag_variance';
      tagId: string;
      direction: 'recorded_less_than_planned' | 'recorded_more_than_planned';
      absoluteMinutes: number;
    };

export interface TimePLReview {
  hasData: boolean;
  summary: {
    plannedMinutes: number;
    recordedMinutes: number;
    varianceMinutes: number;
  };
  accuracy: {
    rate: number;
    status: PlanAccuracyStatus;
  } | null;
  tags: TimePLReviewTag[];
  signals: TimePLReviewSignal[];
}

/** 最小Plan / Record行から、tag別の決定論的なTime P/L reviewを導出する。 */
export function deriveTimePLReview(
  plans: ReadonlyArray<TimePLReviewSourceRow>,
  records: ReadonlyArray<TimePLReviewSourceRow>,
): TimePLReview {
  const tags = aggregateTimePLTags(plans.map(toDurationRow), records.map(toDurationRow))
    .map((totals) => {
      const variance = computePlanVariance(
        totals.plannedMinutes,
        totals.recordedMinutes,
        totals.hasPlan,
      );
      return {
        tagId: totals.tagId,
        plannedMinutes: totals.plannedMinutes,
        recordedMinutes: totals.recordedMinutes,
        varianceMinutes: roundToTenth(variance.varianceMinutes),
        variancePercent: variance.variancePercent,
      };
    })
    .sort(
      (left, right) =>
        Math.max(right.plannedMinutes, right.recordedMinutes) -
          Math.max(left.plannedMinutes, left.recordedMinutes) ||
        compareIds(left.tagId, right.tagId),
    );

  const plannedMinutes = roundToTenth(tags.reduce((sum, tag) => sum + tag.plannedMinutes, 0));
  const recordedMinutes = roundToTenth(tags.reduce((sum, tag) => sum + tag.recordedMinutes, 0));
  const summary = {
    plannedMinutes,
    recordedMinutes,
    varianceMinutes: roundToTenth(plannedMinutes - recordedMinutes),
  };

  if (tags.length === 0) {
    return {
      hasData: false,
      summary,
      accuracy: null,
      tags: [],
      signals: [],
    };
  }

  const derivedAccuracy = computePlanAccuracy(summary.plannedMinutes, summary.recordedMinutes);
  const accuracy = {
    rate: roundToFourDecimals(derivedAccuracy.rate),
    status: derivedAccuracy.status,
  };
  const signals: TimePLReviewSignal[] = [
    {
      code: 'plan_accuracy',
      rate: accuracy.rate,
      status: accuracy.status,
    },
  ];

  const largestVariance = [...tags].sort(
    (left, right) =>
      Math.abs(right.varianceMinutes) - Math.abs(left.varianceMinutes) ||
      compareIds(left.tagId, right.tagId),
  )[0];
  if (largestVariance && largestVariance.varianceMinutes !== 0) {
    signals.push({
      code: 'largest_tag_variance',
      tagId: largestVariance.tagId,
      direction:
        largestVariance.varianceMinutes > 0
          ? 'recorded_less_than_planned'
          : 'recorded_more_than_planned',
      absoluteMinutes: Math.abs(largestVariance.varianceMinutes),
    });
  }

  return {
    hasData: true,
    summary,
    accuracy,
    tags,
    signals,
  };
}

function toDurationRow(row: TimePLReviewSourceRow) {
  return {
    tagId: row.tagId,
    minutes: (Date.parse(row.endAt) - Date.parse(row.startAt)) / 60_000,
  };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToFourDecimals(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
