import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeMonthCount,
  computePreviousDateRange,
  computeStatsDateRange,
} from './compute-date-range';

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
