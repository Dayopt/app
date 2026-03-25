import { describe, expect, it } from 'vitest';

import { buildCalendarPath, buildStatsPath, getLocaleFromPathname } from './navigation-paths';

describe('navigation-paths', () => {
  it('builds a calendar path with date query', () => {
    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'week',
        currentDate: new Date('2026-03-25T09:00:00.000Z'),
      }),
    ).toBe('/ja/calendar/week?date=2026-03-25');
  });

  it('builds a calendar path without query when date is absent', () => {
    expect(buildCalendarPath({ locale: 'en', viewType: 'day' })).toBe('/en/calendar/day');
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
