import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeMonthCount,
  computePreviousDateRange,
  computeStatsDateRange,
} from './computeDateRange';

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
    const result = computeStatsDateRange(new Date(), 'day', 'UTC');
    // UTC timezone: T00:00:00.000Z / T23:59:59.999Z
    expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/);
  });

  describe('granularity = "day"', () => {
    it('UTC: その日の00:00:00Z〜23:59:59.999Zを返す', () => {
      const result = computeStatsDateRange(new Date(), 'day', 'UTC');
      const start = new Date(result.startDate);
      const end = new Date(result.endDate);

      expect(start.getUTCDate()).toBe(10);
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);

      expect(end.getUTCDate()).toBe(10);
      expect(end.getUTCHours()).toBe(23);
      expect(end.getUTCMinutes()).toBe(59);
    });

    it('Asia/Tokyo (UTC+9): ローカル3/10の深夜をUTCに変換して返す', () => {
      // システム時刻は 2026-03-10T12:00:00Z = JST 2026-03-10 21:00
      const result = computeStatsDateRange(new Date(), 'day', 'Asia/Tokyo');
      // JST 2026-03-10 00:00 = UTC 2026-03-09T15:00:00Z
      expect(result.startDate).toBe('2026-03-09T15:00:00.000Z');
      // JST 2026-03-10 23:59:59.999 = UTC 2026-03-10T14:59:59.999Z
      expect(result.endDate).toBe('2026-03-10T14:59:59.999Z');
    });
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

  describe('granularity = "month"', () => {
    it('UTC: 月の1日〜末日の範囲を返す', () => {
      const result = computeStatsDateRange(new Date(), 'month', 'UTC');
      const start = new Date(result.startDate);
      const end = new Date(result.endDate);

      expect(start.getUTCDate()).toBe(1);
      expect(start.getUTCMonth()).toBe(2); // March
      expect(start.getUTCHours()).toBe(0);

      expect(end.getUTCDate()).toBe(31); // March has 31 days
      expect(end.getUTCMonth()).toBe(2);
      expect(end.getUTCHours()).toBe(23);
    });
  });

  describe('granularity = "year"', () => {
    it('UTC: 1月1日〜12月31日の範囲を返す', () => {
      const result = computeStatsDateRange(new Date(), 'year', 'UTC');

      expect(result.startDate).toBe('2026-01-01T00:00:00.000Z');
      expect(result.endDate).toBe('2026-12-31T23:59:59.999Z');
    });

    it('Asia/Tokyo (UTC+9): JSTの年始・年末をUTCに変換して返す', () => {
      const result = computeStatsDateRange(new Date(), 'year', 'Asia/Tokyo');
      // JST 2026-01-01 00:00 = UTC 2025-12-31T15:00:00Z
      expect(result.startDate).toBe('2025-12-31T15:00:00.000Z');
      // JST 2026-12-31 23:59:59.999 = UTC 2026-12-31T14:59:59.999Z
      expect(result.endDate).toBe('2026-12-31T14:59:59.999Z');
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

  it('day UTC: 前日の範囲を返す', () => {
    const result = computePreviousDateRange(new Date(), 'day', 'UTC');
    const start = new Date(result.startDate);
    expect(start.getUTCDate()).toBe(9);
    expect(start.getUTCHours()).toBe(0);
  });
});

describe('computeMonthCount', () => {
  it('dayは1を返す', () => {
    expect(computeMonthCount('day')).toBe(1);
  });

  it('weekは3を返す', () => {
    expect(computeMonthCount('week')).toBe(3);
  });

  it('monthは12を返す', () => {
    expect(computeMonthCount('month')).toBe(12);
  });

  it('yearはundefinedを返す', () => {
    expect(computeMonthCount('year')).toBeUndefined();
  });
});
