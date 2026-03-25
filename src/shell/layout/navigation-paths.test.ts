import { describe, expect, it } from 'vitest';

import { buildCalendarPath, buildStatsPath, getLocaleFromPathname } from './navigation-paths';

describe('navigation-paths', () => {
  it('builds a calendar path with date query', () => {
    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'week',
        currentDate: new Date(2026, 2, 25, 23, 45, 0, 0),
      }),
    ).toBe('/ja/calendar/week?date=2026-03-25');
  });

  it('builds a calendar path without query when date is absent', () => {
    expect(buildCalendarPath({ locale: 'en', viewType: 'day' })).toBe('/en/calendar/day');
  });

  it('keeps the local day for late-night dates', () => {
    expect(
      buildCalendarPath({
        locale: 'en',
        viewType: 'day',
        currentDate: new Date(2026, 2, 25, 23, 59, 0, 0),
      }),
    ).toBe('/en/calendar/day?date=2026-03-25');
  });

  it('builds a localized stats path', () => {
    expect(buildStatsPath('ja')).toBe('/ja/stats/review');
    expect(buildStatsPath('en', 'insights')).toBe('/en/stats/insights');
  });

  it('extracts locale from pathname with fallback', () => {
    expect(getLocaleFromPathname('/en/settings')).toBe('en');
    expect(getLocaleFromPathname('/unknown')).toBe('ja');
    expect(getLocaleFromPathname(null)).toBe('ja');
  });
});
