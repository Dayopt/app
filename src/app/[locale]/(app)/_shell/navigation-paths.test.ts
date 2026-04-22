import { describe, expect, it } from 'vitest';

import {
  buildCalendarPath,
  buildStatsPath,
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

describe('getModeFromPath', () => {
  // 必須 10 ケース (Step C-2 設計書準拠)
  it('returns calendar for /ja/calendar/day', () => {
    expect(getModeFromPath('/ja/calendar/day')).toBe('calendar');
  });

  it('returns calendar for /en/calendar/week (locale prefix 非依存)', () => {
    expect(getModeFromPath('/en/calendar/week')).toBe('calendar');
  });

  it('returns stats for /ja/stats/review', () => {
    expect(getModeFromPath('/ja/stats/review')).toBe('stats');
  });

  it('returns stats for /ja/stats/tags/abc123 (深い pathname)', () => {
    expect(getModeFromPath('/ja/stats/tags/abc123')).toBe('stats');
  });

  it('returns ai for /ja/ai (Step C-3 で活用)', () => {
    expect(getModeFromPath('/ja/ai')).toBe('ai');
  });

  it('returns ai for /ja/ai/threads/xxx', () => {
    expect(getModeFromPath('/ja/ai/threads/xxx')).toBe('ai');
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

  // 追加の defensive ケース
  it('returns other for null / undefined (defensive)', () => {
    expect(getModeFromPath(null)).toBe('other');
    expect(getModeFromPath(undefined)).toBe('other');
  });

  it('treats trailing slash equivalently', () => {
    expect(getModeFromPath('/ja/calendar/')).toBe('calendar');
    expect(getModeFromPath('/ja/stats/')).toBe('stats');
    expect(getModeFromPath('/ja/ai/')).toBe('ai');
  });

  it('handles exact-match route endings', () => {
    // Next.js App Router の usePathname は通常 query を含まないが defensive に
    expect(getModeFromPath('/ja/stats')).toBe('stats');
    expect(getModeFromPath('/ja/ai')).toBe('ai');
  });
});
