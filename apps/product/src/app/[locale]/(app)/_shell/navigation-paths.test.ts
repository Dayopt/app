import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/calendar', () => ({
  formatCalendarDateParam: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
}));

import { buildCalendarPath, getLocaleFromPathname } from './navigation-paths';

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

  it('adds diff panel only for day calendar paths', () => {
    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'day',
        currentDate: new Date(2026, 2, 25),
        panelKind: 'diff',
      }),
    ).toBe('/ja/calendar/day?date=2026-03-25&panel=diff');

    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'week',
        currentDate: new Date(2026, 2, 25),
        panelKind: 'diff',
      }),
    ).toBe('/ja/calendar/week?date=2026-03-25');
  });

  it('builds review panel paths with optional tag selection', () => {
    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'week',
        currentDate: new Date(2026, 2, 25),
        panelKind: 'review',
      }),
    ).toBe('/ja/calendar/week?date=2026-03-25&panel=review');

    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'week',
        currentDate: new Date(2026, 2, 25),
        panelKind: 'review',
        reviewTagId: 'tag-1',
      }),
    ).toBe('/ja/calendar/week?date=2026-03-25&panel=review&reviewTagId=tag-1');
  });

  it('drops review tag id outside the review panel', () => {
    expect(
      buildCalendarPath({
        locale: 'ja',
        viewType: 'day',
        currentDate: new Date(2026, 2, 25),
        panelKind: 'analytics',
        reviewTagId: 'tag-1',
      }),
    ).toBe('/ja/calendar/day?date=2026-03-25&panel=analytics');
  });

  it('extracts locale from pathname with fallback', () => {
    expect(getLocaleFromPathname('/en/settings')).toBe('en');
    expect(getLocaleFromPathname('/unknown')).toBe('ja');
    expect(getLocaleFromPathname(null)).toBe('ja');
  });
});
