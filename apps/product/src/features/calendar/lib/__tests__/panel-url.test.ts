import { describe, expect, it } from 'vitest';

import { buildCalendarReviewPanelPath } from '../panel-url';

describe('buildCalendarReviewPanelPath', () => {
  it('builds the canonical calendar review panel URL', () => {
    expect(buildCalendarReviewPanelPath('ja', new Date(2026, 2, 25))).toBe(
      '/ja/week?date=2026-03-25&panel=review',
    );
  });

  it('adds reviewTagId without mixing it into calendar tag filters', () => {
    expect(buildCalendarReviewPanelPath('en', new Date(2026, 2, 25), 'tag-1')).toBe(
      '/en/week?date=2026-03-25&panel=review&reviewTagId=tag-1',
    );
  });
});
