import { describe, expect, it } from 'vitest';

import {
  getLegalReviewWarningItemKeys,
  shouldShowLegalReviewWarning,
} from '../legal-review-warning';

describe('legal review warning', () => {
  it('development の標準4文書だけに表示する', () => {
    for (const slug of ['privacy', 'terms', 'cookies', 'tokushoho'] as const) {
      expect(shouldShowLegalReviewWarning('development', slug)).toBe(true);
    }
    expect(shouldShowLegalReviewWarning('development', 'security')).toBe(false);
    expect(shouldShowLegalReviewWarning('production', 'privacy')).toBe(false);
  });

  it('tokushoho だけ placeholder warning を追加する', () => {
    expect(getLegalReviewWarningItemKeys('privacy')).toEqual(['lawyer', 'update']);
    expect(getLegalReviewWarningItemKeys('tokushoho')).toEqual(['lawyer', 'update', 'placeholder']);
  });
});
