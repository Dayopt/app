import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/calendar', () => ({
  formatCalendarDateParam: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
}));

import {
  buildCalendarPath,
  buildReviewPath,
  getLocaleFromPathname,
  getModeFromPath,
} from './navigation-paths';

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

  it('builds a localized review path', () => {
    expect(buildReviewPath('ja')).toBe('/ja/review');
    expect(buildReviewPath('en', { granularity: 'week' })).toBe('/en/review?g=week');
  });

  it('extracts locale from pathname with fallback', () => {
    expect(getLocaleFromPathname('/en/settings')).toBe('en');
    expect(getLocaleFromPathname('/unknown')).toBe('ja');
    expect(getLocaleFromPathname(null)).toBe('ja');
  });
});

describe('getModeFromPath', () => {
  it('returns calendar for /ja/calendar/day', () => {
    expect(getModeFromPath('/ja/calendar/day')).toBe('calendar');
  });

  it('returns calendar for /en/calendar/week (locale prefix 非依存)', () => {
    expect(getModeFromPath('/en/calendar/week')).toBe('calendar');
  });

  it('returns review for /ja/review', () => {
    expect(getModeFromPath('/ja/review')).toBe('review');
  });

  it('returns review for /ja/review/tags/abc123 (深い pathname)', () => {
    expect(getModeFromPath('/ja/review/tags/abc123')).toBe('review');
  });

  it('returns other for /ja/settings (fallback)', () => {
    expect(getModeFromPath('/ja/settings')).toBe('other');
  });

  it('returns other for /ja/settings/account', () => {
    expect(getModeFromPath('/ja/settings/account')).toBe('other');
  });

  it('returns other for /ja (root)', () => {
    expect(getModeFromPath('/ja')).toBe('other');
  });

  it('returns other for empty string (defensive)', () => {
    expect(getModeFromPath('')).toBe('other');
  });

  it('returns other for null / undefined (defensive)', () => {
    expect(getModeFromPath(null)).toBe('other');
    expect(getModeFromPath(undefined)).toBe('other');
  });

  it('treats trailing slash equivalently', () => {
    expect(getModeFromPath('/ja/calendar/')).toBe('calendar');
    expect(getModeFromPath('/ja/review/')).toBe('review');
  });

  it('handles exact-match route endings', () => {
    expect(getModeFromPath('/ja/review')).toBe('review');
  });
});
