import { describe, expect, it } from 'vitest';
import { toTimeModelReviewDiff } from './time-model-review-diff';

describe('toTimeModelReviewDiff', () => {
  it('未記録を含む1:N差分の表示契約を保持する', () => {
    const result = toTimeModelReviewDiff({
      summary: {
        plannedMinutes: 60,
        actualMinutes: 0,
        diffMinutes: -60,
        unplannedMinutes: 0,
        unrecordedMinutes: 60,
      },
      items: [
        {
          id: 'unrecorded:plan-1',
          kind: 'unrecorded',
          title: 'Plan',
          tagId: null,
          color: 'gray',
          planId: 'plan-1',
          plannedMinutes: 60,
          actualMinutes: 0,
          diffMinutes: -60,
          sortTime: 0,
        },
      ],
    });
    expect(result.items[0]?.kind).toBe('unrecorded');
    expect(result.summary.unrecordedMinutes).toBe(60);
  });
});
