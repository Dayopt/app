import { describe, expect, it } from 'vitest';

import { aggregateDayOfWeekDistribution } from '../day-of-week-distribution';

describe('aggregateDayOfWeekDistribution', () => {
  it('空配列 → 7 slot 全て 0', () => {
    const result = aggregateDayOfWeekDistribution([]);
    expect(result).toHaveLength(7);
    expect(result.every((s) => s.hours === 0)).toBe(true);
  });

  it('月曜始まりの順序で並ぶ', () => {
    const result = aggregateDayOfWeekDistribution([]);
    expect(result.map((s) => s.day)).toEqual(['月', '火', '水', '木', '金', '土', '日']);
  });

  it('total_minutes を時間単位に変換する', () => {
    const result = aggregateDayOfWeekDistribution([{ dow: 1, total_minutes: 120 }]);
    expect(result.find((s) => s.day === '月')?.hours).toBe(2);
  });

  it('日曜は配列末尾に来る', () => {
    const result = aggregateDayOfWeekDistribution([{ dow: 0, total_minutes: 60 }]);
    expect(result.at(-1)).toEqual({ day: '日', hours: 1 });
  });

  it('dow が範囲外 (< 0) の row は無視する', () => {
    const result = aggregateDayOfWeekDistribution([{ dow: -1, total_minutes: 120 }]);
    expect(result.every((s) => s.hours === 0)).toBe(true);
  });

  it('dow が範囲外 (>= 7) の row は無視する', () => {
    const result = aggregateDayOfWeekDistribution([{ dow: 7, total_minutes: 120 }]);
    expect(result.every((s) => s.hours === 0)).toBe(true);
  });

  it('複数曜日の混合 → 各曜日に正しく振り分け', () => {
    const result = aggregateDayOfWeekDistribution([
      { dow: 1, total_minutes: 60 },
      { dow: 3, total_minutes: 90 },
      { dow: 6, total_minutes: 30 },
      { dow: 0, total_minutes: 180 },
    ]);
    expect(result.find((s) => s.day === '月')?.hours).toBe(1);
    expect(result.find((s) => s.day === '水')?.hours).toBe(1.5);
    expect(result.find((s) => s.day === '土')?.hours).toBe(0.5);
    expect(result.find((s) => s.day === '日')?.hours).toBe(3);
  });
});
