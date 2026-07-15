import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeCalendarDisplayDateRanges,
  computeMonthCount,
  computePreviousDateRange,
  computeStatsDateRange,
  resolveReviewQueryYear,
} from './compute-date-range';

describe('computeCalendarDisplayDateRanges', () => {
  it('day: Calendar の1日を timezone の日境界へ変換する', () => {
    const result = computeCalendarDisplayDateRanges(
      {
        start: new Date(2026, 2, 10, 0, 0, 0, 0),
        end: new Date(2026, 2, 10, 23, 59, 59, 999),
      },
      'UTC',
    );

    expect(result).toEqual({
      dateRange: {
        startDate: '2026-03-10T00:00:00.000Z',
        endDate: '2026-03-10T23:59:59.999Z',
      },
      prevDateRange: {
        startDate: '2026-03-09T00:00:00.000Z',
        endDate: '2026-03-09T23:59:59.999Z',
      },
      dayCount: 1,
    });
  });

  it('week: Calendar の7日と直前の7日を Asia/Tokyo 境界で返す', () => {
    const result = computeCalendarDisplayDateRanges(
      {
        start: new Date(2026, 2, 9, 0, 0, 0, 0),
        end: new Date(2026, 2, 15, 23, 59, 59, 999),
      },
      'Asia/Tokyo',
    );

    expect(result).toEqual({
      dateRange: {
        startDate: '2026-03-08T15:00:00.000Z',
        endDate: '2026-03-15T14:59:59.999Z',
      },
      prevDateRange: {
        startDate: '2026-03-01T15:00:00.000Z',
        endDate: '2026-03-08T14:59:59.999Z',
      },
      dayCount: 7,
    });
  });

  it('multi-day: DST をまたいでも直前の同じローカル日数を返す', () => {
    const result = computeCalendarDisplayDateRanges(
      {
        start: new Date(2026, 2, 7, 0, 0, 0, 0),
        end: new Date(2026, 2, 9, 23, 59, 59, 999),
      },
      'America/New_York',
    );

    expect(result).toEqual({
      dateRange: {
        startDate: '2026-03-07T05:00:00.000Z',
        endDate: '2026-03-10T03:59:59.999Z',
      },
      prevDateRange: {
        startDate: '2026-03-04T05:00:00.000Z',
        endDate: '2026-03-07T04:59:59.999Z',
      },
      dayCount: 3,
    });
  });
});

describe('resolveReviewQueryYear', () => {
  it('Calendar の基準日を store の遅延同期値より優先する', () => {
    expect(resolveReviewQueryYear(new Date(2027, 0, 1), new Date(2026, 11, 31))).toBe(2027);
  });

  it('Calendar の基準日がない既存利用では store 値へフォールバックする', () => {
    expect(resolveReviewQueryYear(undefined, new Date(2026, 11, 31))).toBe(2026);
  });
});

describe('computeStatsDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-03-10 12:00 UTC（火曜日）
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('UTC正規化されたISO文字列を返す（UTC timezone）', () => {
    const result = computeStatsDateRange(new Date(), 'week', 'UTC');
    // UTC timezone: T00:00:00.000Z / T23:59:59.999Z
    expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/);
  });

  describe('granularity = "week"', () => {
    it('UTC: 月曜〜日曜の範囲を返す', () => {
      const result = computeStatsDateRange(new Date(), 'week', 'UTC');
      const start = new Date(result.startDate);
      const end = new Date(result.endDate);

      // 2026-03-10 は火曜なので、月曜 = 3/9
      expect(start.getUTCDate()).toBe(9);
      expect(start.getUTCDay()).toBe(1); // Monday
      expect(start.getUTCHours()).toBe(0);

      // 日曜 = 3/15
      expect(end.getUTCDate()).toBe(15);
      expect(end.getUTCDay()).toBe(0); // Sunday
      expect(end.getUTCHours()).toBe(23);
    });
  });
});

describe('computePreviousDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('week UTC: 前週の範囲を返す', () => {
    const result = computePreviousDateRange(new Date(), 'week', 'UTC');
    const start = new Date(result.startDate);
    expect(start.getUTCDate()).toBe(2);
    expect(start.getUTCHours()).toBe(0);
  });
});

describe('computeMonthCount', () => {
  it('weekは3を返す', () => {
    expect(computeMonthCount('week')).toBe(3);
  });
});
