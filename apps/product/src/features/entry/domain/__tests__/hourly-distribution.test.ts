import { describe, expect, it } from 'vitest';

import { aggregateHourlyDistribution } from '../hourly-distribution';

describe('aggregateHourlyDistribution', () => {
  it('空配列 → 12 slot 全て 0', () => {
    const result = aggregateHourlyDistribution([]);
    expect(result).toHaveLength(12);
    expect(result.every((s) => s.hours === 0)).toBe(true);
  });

  it('timeSlot は "HH:00" 形式で 0-22 の偶数時刻', () => {
    const result = aggregateHourlyDistribution([]);
    expect(result.map((s) => s.timeSlot)).toEqual([
      '00:00',
      '02:00',
      '04:00',
      '06:00',
      '08:00',
      '10:00',
      '12:00',
      '14:00',
      '16:00',
      '18:00',
      '20:00',
      '22:00',
    ]);
  });

  it('total_minutes を時間単位に変換する', () => {
    const result = aggregateHourlyDistribution([{ hour: 0, total_minutes: 60 }]);
    expect(result[0]?.hours).toBe(1);
  });

  it('連続する 2 時間を 1 slot に集約する', () => {
    const result = aggregateHourlyDistribution([
      { hour: 0, total_minutes: 30 },
      { hour: 1, total_minutes: 60 },
    ]);
    expect(result[0]?.hours).toBe(0.5 + 1);
  });

  it('hour が範囲外 (< 0) の row は無視する', () => {
    const result = aggregateHourlyDistribution([{ hour: -1, total_minutes: 120 }]);
    expect(result.every((s) => s.hours === 0)).toBe(true);
  });

  it('hour が範囲外 (>= 24) の row は無視する', () => {
    const result = aggregateHourlyDistribution([{ hour: 24, total_minutes: 120 }]);
    expect(result.every((s) => s.hours === 0)).toBe(true);
  });

  it('複数時刻の混合 → 各 slot に正しく振り分け', () => {
    const result = aggregateHourlyDistribution([
      { hour: 8, total_minutes: 60 },
      { hour: 9, total_minutes: 30 },
      { hour: 14, total_minutes: 120 },
    ]);
    expect(result.find((s) => s.timeSlot === '08:00')?.hours).toBe(1.5);
    expect(result.find((s) => s.timeSlot === '14:00')?.hours).toBe(2);
    expect(result.find((s) => s.timeSlot === '00:00')?.hours).toBe(0);
  });
});
