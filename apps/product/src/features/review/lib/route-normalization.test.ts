import { describe, expect, it } from 'vitest';

import {
  buildDailyReviewRedirectPath,
  buildWeeklyTagDetailPath,
  parseReviewGranularityParam,
} from './route-normalization';

describe('review route normalization', () => {
  it('parses only weekly review granularity', () => {
    expect(parseReviewGranularityParam('week')).toBe('week');
    expect(parseReviewGranularityParam('day')).toBeUndefined();
    expect(parseReviewGranularityParam(undefined)).toBeUndefined();
  });

  it('builds the calendar compare redirect path for daily review links', () => {
    expect(buildDailyReviewRedirectPath('ja', '2026-06-18')).toBe(
      '/ja/day?date=2026-06-18&compare=1',
    );
  });

  it('normalizes day tag review links to weekly tag detail', () => {
    expect(buildWeeklyTagDetailPath('en', 'tag-1', '2026-06-18')).toBe(
      '/en/review/tags/tag-1?g=week&d=2026-06-18',
    );
  });
});
