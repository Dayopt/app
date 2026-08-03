import type { TimeRange } from './time-range';

export const reviewPeriods = ['day', 'week', 'month', 'year'] as const;

export type ReviewPeriod = (typeof reviewPeriods)[number];

export type ReviewRange = TimeRange &
  Readonly<{
    period: ReviewPeriod;
  }>;

export function isReviewPeriod(value: string): value is ReviewPeriod {
  return reviewPeriods.includes(value as ReviewPeriod);
}

export type PlanAccuracyStatus = 'excellent' | 'good' | 'fair' | 'poor';

interface PlanAccuracy {
  rate: number;
  status: PlanAccuracyStatus;
}

interface PlanVariance {
  varianceMinutes: number;
  variancePercent: number | null;
}

/** Plan / Recordの全体精度を既存Review thresholdで分類する。 */
export function computePlanAccuracy(plannedMinutes: number, recordedMinutes: number): PlanAccuracy {
  const rate =
    plannedMinutes === 0
      ? recordedMinutes === 0
        ? 1
        : 0
      : Math.max(0, Math.min(1, 1 - Math.abs(plannedMinutes - recordedMinutes) / plannedMinutes));
  return { rate, status: getPlanAccuracyStatus(rate) };
}

/** 精度率をReview UIとMCPが共有する4段階へ分類する。 */
export function getPlanAccuracyStatus(rate: number): PlanAccuracyStatus {
  if (rate >= 0.95) return 'excellent';
  if (rate >= 0.85) return 'good';
  if (rate >= 0.7) return 'fair';
  return 'poor';
}

/** `planned - recorded` の符号規約でPlan / Record varianceを算出する。 */
export function computePlanVariance(
  plannedMinutes: number,
  recordedMinutes: number,
  hasPlan: boolean,
): PlanVariance {
  const varianceMinutes = plannedMinutes - recordedMinutes;
  const variancePercent = hasPlan
    ? Math.round((varianceMinutes / Math.max(plannedMinutes, 1)) * 100)
    : null;
  return { varianceMinutes, variancePercent };
}
