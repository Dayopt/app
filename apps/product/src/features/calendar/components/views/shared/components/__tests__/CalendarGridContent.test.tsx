import { describe, expect, it } from 'vitest';

import { getGhostEntryHeight } from '../CalendarGridContent';

describe('CalendarGridContent', () => {
  it('drag ghost uses the rendered entry height instead of a full-day sentinel height', () => {
    expect(getGhostEntryHeight({ height: '60px' })).toBe(60);
    expect(getGhostEntryHeight({ height: 58 })).toBe(58);
  });

  it('falls back to a compact height when entry style is unavailable', () => {
    expect(getGhostEntryHeight(undefined)).toBe(20);
    expect(getGhostEntryHeight({ height: 'auto' })).toBe(20);
  });
});
