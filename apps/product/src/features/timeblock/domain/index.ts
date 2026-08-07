export { aggregateDayOfWeekDistribution } from './day-of-week-distribution';
export {
  aggregatePlanRecordEstimationAccuracy,
  transformEstimationAccuracy,
} from './estimation-accuracy';
export type { EstimationAccuracyDbRow, EstimationAccuracyTagLookup } from './estimation-accuracy';
export { aggregateHourlyDistribution } from './hourly-distribution';
export { aggregateMonthlyTrend, getMonthlyStartDate } from './monthly-trend';
export { calculateStreak } from './streak-calculator';

// MIN_ESTIMATION_SAMPLE_COUNT / projectActualMinutes は barrel に出さない。
// consumer（hook / test）が leaf を直接参照しており barrel 経由の consumer がいないため
// （`.claude/rules/feature-boundaries.md` の「barrel 経由の consumer が実際にいるか」で判断）。
export { aggregateTagEstimationFactors } from './tag-estimation-factor';
export type { TagEstimationFactor } from './tag-estimation-factor';
export { aggregateTagPlanCounts, aggregateTagStats } from './tag-stats';
export { deriveTimePLReview } from './time-pl-review';
export type { TimePLReview } from './time-pl-review';
