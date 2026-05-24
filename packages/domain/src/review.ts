import type { TimeRange } from './time-range';

export const reviewPeriods = ['day', 'week', 'month'] as const;

export type ReviewPeriod = (typeof reviewPeriods)[number];

export type ReviewRange = TimeRange &
  Readonly<{
    period: ReviewPeriod;
  }>;

export function isReviewPeriod(value: string): value is ReviewPeriod {
  return reviewPeriods.includes(value as ReviewPeriod);
}
