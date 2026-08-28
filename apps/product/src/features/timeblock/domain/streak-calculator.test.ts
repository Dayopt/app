import { describe, expect, it } from 'vitest';

import { calculateStreak } from './streak-calculator';

describe('calculateStreak', () => {
  const tz = 'UTC';

  it('activeDates 空 → 0', () => {
    expect(calculateStreak({ activeDates: [], todayStr: '2026-05-26', timezone: tz })).toBe(0);
  });

  it('今日のみ → 1', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-05-26'],
        todayStr: '2026-05-26',
        timezone: tz,
      }),
    ).toBe(1);
  });

  it('今日 + 昨日 + 一昨日 連続 → 3', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-05-26', '2026-05-25', '2026-05-24'],
        todayStr: '2026-05-26',
        timezone: tz,
      }),
    ).toBe(3);
  });

  it('今日が active でない → 0 で break', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-05-25', '2026-05-24'],
        todayStr: '2026-05-26',
        timezone: tz,
      }),
    ).toBe(0);
  });

  it('途中で 1 日抜けると break する', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-05-26', '2026-05-25', '2026-05-23'],
        todayStr: '2026-05-26',
        timezone: tz,
      }),
    ).toBe(2);
  });

  it('順序に依存しない（Set で扱われる）', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-05-24', '2026-05-26', '2026-05-25'],
        todayStr: '2026-05-26',
        timezone: tz,
      }),
    ).toBe(3);
  });

  it('Asia/Tokyo TZ でも同日の判定が一致する', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-05-26'],
        todayStr: '2026-05-26',
        timezone: 'Asia/Tokyo',
      }),
    ).toBe(1);
  });

  it('365 日の上限で打ち切る', () => {
    // 今日から 400 日連続で active dates を作る
    const dates: string[] = [];
    const today = new Date('2026-05-26T00:00:00Z').getTime();
    for (let i = 0; i < 400; i++) {
      const d = new Date(today - i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }
    expect(calculateStreak({ activeDates: dates, todayStr: '2026-05-26', timezone: tz })).toBe(365);
  });
});
