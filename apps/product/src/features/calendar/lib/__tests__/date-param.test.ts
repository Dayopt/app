import { describe, expect, it } from 'vitest';

import { formatCalendarDateParam, parseCalendarDateParam } from '../date-param';

describe('calendar date param helpers', () => {
  it('parses YYYY-MM-DD as a stable local date', () => {
    const parsed = parseCalendarDateParam('2026-03-25');

    expect(parsed).toBeDefined();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(25);
    expect(parsed?.getHours()).toBe(12);
  });

  it('rejects invalid calendar dates', () => {
    expect(parseCalendarDateParam('2026-02-31')).toBeUndefined();
    expect(parseCalendarDateParam('not-a-date')).toBeUndefined();
    expect(parseCalendarDateParam(undefined)).toBeUndefined();
  });

  it('formats using the local calendar day', () => {
    expect(formatCalendarDateParam(new Date(2026, 2, 25, 23, 45, 0, 0))).toBe('2026-03-25');
  });

  it('round-trips parsed dates without shifting the day', () => {
    const parsed = parseCalendarDateParam('2026-11-05');

    expect(parsed).toBeDefined();
    expect(formatCalendarDateParam(parsed!)).toBe('2026-11-05');
  });
});
