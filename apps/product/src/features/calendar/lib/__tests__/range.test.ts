import { describe, expect, it } from 'vitest';

import { calculateViewDateRange, getNextPeriod, getPreviousPeriod } from '../range';

describe('calculateViewDateRange', () => {
  describe('day view', () => {
    it('1日分の範囲を返す', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('day', date);

      expect(range.days).toHaveLength(1);
      expect(range.start.getHours()).toBe(0);
      expect(range.end.getHours()).toBe(23);
    });
  });

  describe('week view', () => {
    it('7日分の範囲を返す', () => {
      const date = new Date('2026-01-15T12:00:00'); // 木曜日
      const range = calculateViewDateRange('week', date, 1); // 月曜始まり

      expect(range.days).toHaveLength(7);
      // 月曜始まり: 2026-01-12(月) 〜 2026-01-18(日)
      expect(range.start.getDay()).toBe(1); // 月曜日
    });

    it('日曜始まりに対応', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('week', date, 0);

      expect(range.days).toHaveLength(7);
      expect(range.start.getDay()).toBe(0); // 日曜日
    });
  });

  describe('multi-day view', () => {
    it('3day: currentDateを中心に3日分を返す', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('3day', date);

      expect(range.days).toHaveLength(3);
      // offset = floor(3/2) = 1
      // start = 1/14, end = 1/16
      expect(range.days[0]!.getDate()).toBe(14);
      expect(range.days[2]!.getDate()).toBe(16);
    });

    it('5day: 5日分を返す', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('5day', date);

      expect(range.days).toHaveLength(5);
    });
  });
});

describe('getNextPeriod', () => {
  it('day: 1日進む', () => {
    const date = new Date('2026-01-15');
    const next = getNextPeriod('day', date);
    expect(next.getDate()).toBe(16);
  });

  it('week: 7日進む', () => {
    const date = new Date('2026-01-15');
    const next = getNextPeriod('week', date);
    expect(next.getDate()).toBe(22);
  });

  it('3day: 3日進む', () => {
    const date = new Date('2026-01-15');
    const next = getNextPeriod('3day', date);
    expect(next.getDate()).toBe(18);
  });
});

describe('getPreviousPeriod', () => {
  it('day: 1日戻る', () => {
    const date = new Date('2026-01-15');
    const prev = getPreviousPeriod('day', date);
    expect(prev.getDate()).toBe(14);
  });

  it('week: 7日戻る', () => {
    const date = new Date('2026-01-15');
    const prev = getPreviousPeriod('week', date);
    expect(prev.getDate()).toBe(8);
  });

  it('3day: 3日戻る', () => {
    const date = new Date('2026-01-15');
    const prev = getPreviousPeriod('3day', date);
    expect(prev.getDate()).toBe(12);
  });
});
