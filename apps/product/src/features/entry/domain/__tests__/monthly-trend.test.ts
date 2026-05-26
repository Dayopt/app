import { describe, expect, it } from 'vitest';

import { aggregateMonthlyTrend, getMonthlyStartDate } from '../monthly-trend';

describe('getMonthlyStartDate', () => {
  it('通常: 2026年5月から3ヶ月前 → 2026-03-01 UTC', () => {
    expect(getMonthlyStartDate(2026, 5, 3).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('年跨ぎ: 2026年2月から4ヶ月前 → 2025-11-01 UTC', () => {
    expect(getMonthlyStartDate(2026, 2, 4).toISOString()).toBe('2025-11-01T00:00:00.000Z');
  });

  it('1年分: 2026年1月から12ヶ月前 → 2025-02-01 UTC', () => {
    expect(getMonthlyStartDate(2026, 1, 12).toISOString()).toBe('2025-02-01T00:00:00.000Z');
  });

  it('単月: monthCount=1 → 当月の1日', () => {
    expect(getMonthlyStartDate(2026, 5, 1).toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('24ヶ月（leap year 2024 を跨ぐ）: 2026年5月から → 2024-06-01 UTC', () => {
    expect(getMonthlyStartDate(2026, 5, 24).toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('12月終わり: 2026年12月から2ヶ月前 → 2026-11-01 UTC', () => {
    expect(getMonthlyStartDate(2026, 12, 2).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('1月始め: 2026年1月から2ヶ月前 → 2025-12-01 UTC', () => {
    expect(getMonthlyStartDate(2026, 1, 2).toISOString()).toBe('2025-12-01T00:00:00.000Z');
  });
});

describe('aggregateMonthlyTrend', () => {
  it('通常: rows 空 → 3 slot 全て hours=0、月キーは降順 2026-03/04/05', () => {
    const result = aggregateMonthlyTrend([], 2026, 5, 3);
    expect(result).toEqual([
      { month: '2026-03', label: '3', hours: 0 },
      { month: '2026-04', label: '4', hours: 0 },
      { month: '2026-05', label: '5', hours: 0 },
    ]);
  });

  it('年跨ぎ: 2026年2月から4ヶ月 → 2025-11/12 + 2026-01/02', () => {
    const result = aggregateMonthlyTrend([], 2026, 2, 4);
    expect(result.map((s) => s.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('2月を含む期間: 2026年3月から2ヶ月 → 2026-02/03', () => {
    const result = aggregateMonthlyTrend([], 2026, 3, 2);
    expect(result.map((s) => s.month)).toEqual(['2026-02', '2026-03']);
  });

  it('leap year + 年跨ぎ: 2024年3月から14ヶ月 → 2023-02 + 2024-02 を含む', () => {
    const result = aggregateMonthlyTrend([], 2024, 3, 14);
    const months = result.map((s) => s.month);
    expect(months[0]).toBe('2023-02');
    expect(months.at(-1)).toBe('2024-03');
    expect(months).toContain('2024-02');
    expect(result).toHaveLength(14);
  });

  it('partial month: 一部の row のみ → 既知月だけ上書き、未知月は 0', () => {
    const result = aggregateMonthlyTrend(
      [
        { month: '2026-04', hours: 12.5 },
        { month: '2026-05', hours: 30 },
      ],
      2026,
      5,
      3,
    );
    expect(result).toEqual([
      { month: '2026-03', label: '3', hours: 0 },
      { month: '2026-04', label: '4', hours: 12.5 },
      { month: '2026-05', label: '5', hours: 30 },
    ]);
  });

  it('未知 month の row は無視: 範囲外でも結果には現れない', () => {
    const result = aggregateMonthlyTrend(
      [
        { month: '2020-01', hours: 999 },
        { month: '2026-05', hours: 5 },
      ],
      2026,
      5,
      3,
    );
    expect(result.find((s) => s.month === '2020-01')).toBeUndefined();
    expect(result.find((s) => s.month === '2026-05')?.hours).toBe(5);
  });

  it('同月複数 row: 後勝ち (overlay)', () => {
    const result = aggregateMonthlyTrend(
      [
        { month: '2026-05', hours: 10 },
        { month: '2026-05', hours: 20 },
      ],
      2026,
      5,
      1,
    );
    expect(result[0]?.hours).toBe(20);
  });

  it('label format: leading zero なし', () => {
    const result = aggregateMonthlyTrend([], 2026, 12, 12);
    expect(result.map((s) => s.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
  });

  it('sort: shuffle した rows でも結果は月昇順', () => {
    const result = aggregateMonthlyTrend(
      [
        { month: '2026-05', hours: 5 },
        { month: '2026-03', hours: 3 },
        { month: '2026-04', hours: 4 },
      ],
      2026,
      5,
      3,
    );
    expect(result.map((s) => s.month)).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(result.map((s) => s.hours)).toEqual([3, 4, 5]);
  });

  it('monthCount=1 → 単一 slot', () => {
    const result = aggregateMonthlyTrend([{ month: '2026-05', hours: 7 }], 2026, 5, 1);
    expect(result).toEqual([{ month: '2026-05', label: '5', hours: 7 }]);
  });
});
