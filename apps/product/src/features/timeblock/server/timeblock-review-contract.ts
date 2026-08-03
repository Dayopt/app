import type { TimePLReview } from '../domain';

import type { TimeblockContextRange } from './timeblock-context-contract';

export const TIMEBLOCK_REVIEW_MAX_TAGS = 1_000;

export const TIMEBLOCK_REVIEW_BASIS = {
  planMeaning: 'budget',
  recordMeaning: 'actual',
  rowFilter: 'active_tagged_start_in_period',
  durationBoundary: 'full_row_not_clipped',
  periodBoundary: '[)',
  varianceConvention: 'planned_minus_recorded',
} as const;

export interface TimeblockMcpReview extends TimePLReview {
  asOf: string;
  period: TimeblockContextRange & {
    endExclusive: true;
    timezone: string;
  };
  basis: typeof TIMEBLOCK_REVIEW_BASIS;
}
