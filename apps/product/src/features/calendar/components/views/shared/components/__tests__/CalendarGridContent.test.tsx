import { describe, expect, it } from 'vitest';

import { getGhostEntryHeight, minutesToSelection } from '../CalendarGridContent';

describe('CalendarGridContent', () => {
  it('drag ghost uses the rendered entry height instead of a full-day sentinel height', () => {
    expect(getGhostEntryHeight({ height: '60px' })).toBe(60);
    expect(getGhostEntryHeight({ height: 58 })).toBe(58);
  });

  it('falls back to a compact height when entry style is unavailable', () => {
    expect(getGhostEntryHeight(undefined)).toBe(20);
    expect(getGhostEntryHeight({ height: 'auto' })).toBe(20);
  });

  it('planned の前半 gap 分数をインライン作成 selection に変換する', () => {
    const date = new Date('2026-06-04T00:00:00');

    expect(minutesToSelection(date, 13 * 60, 13 * 60 + 30, 'planned-gap')).toEqual({
      date,
      startHour: 13,
      startMinute: 0,
      endHour: 13,
      endMinute: 30,
      creationSource: 'planned-gap',
    });
  });
});
