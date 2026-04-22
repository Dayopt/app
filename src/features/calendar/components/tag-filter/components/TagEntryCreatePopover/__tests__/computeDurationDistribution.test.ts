import { describe, expect, it } from 'vitest';

import {
  computeDurationDistribution,
  snapToBucket,
  type DurationSample,
} from '../computeDurationDistribution';

/** ヘルパー: duration だけ指定してサンプル配列を作る */
function makeSamples(durations: number[]): DurationSample[] {
  return durations.map((durationMinutes, i) => ({
    entryId: `entry-${i}`,
    durationMinutes,
    startedAt: `2026-04-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
  }));
}

describe('snapToBucket', () => {
  it('5 分刻みに四捨五入する（境界 12/13/17/18）', () => {
    expect(snapToBucket(12)).toBe(10);
    expect(snapToBucket(13)).toBe(15);
    expect(snapToBucket(17)).toBe(15);
    expect(snapToBucket(18)).toBe(20);
  });

  it('0 以下は 0 を返す', () => {
    expect(snapToBucket(0)).toBe(0);
    expect(snapToBucket(-5)).toBe(0);
  });

  it('NaN / Infinity は 0 を返す', () => {
    expect(snapToBucket(Number.NaN)).toBe(0);
    expect(snapToBucket(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('computeDurationDistribution', () => {
  it('空配列: sampleSize 0 / candidates 空 / varianceFlag false', () => {
    const result = computeDurationDistribution([]);
    expect(result.sampleSize).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(result.bins).toEqual([]);
    expect(result.varianceFlag).toBe(false);
  });

  it('1 件: 候補 1 / histogram は bins に 1 件だけ / varianceFlag false', () => {
    const result = computeDurationDistribution(makeSamples([45]));
    expect(result.sampleSize).toBe(1);
    expect(result.candidates).toEqual([{ durationMinutes: 45, count: 1 }]);
    expect(result.bins).toEqual([{ durationMinutes: 45, count: 1 }]);
    expect(result.varianceFlag).toBe(false);
  });

  it('2 件 (45/50): 候補 2 個が並ぶ / sampleSize < 10 で varianceFlag false', () => {
    const result = computeDurationDistribution(makeSamples([45, 50]));
    expect(result.sampleSize).toBe(2);
    expect(result.candidates.length).toBe(2);
    expect(result.varianceFlag).toBe(false);
  });

  it('FullData (15 件): 上位 3 候補は [60, 45, 25]（2 票タイは duration 昇順）', () => {
    const result = computeDurationDistribution(
      makeSamples([25, 25, 30, 30, 45, 45, 45, 60, 60, 60, 60, 60, 90, 90, 120]),
    );
    expect(result.sampleSize).toBe(15);
    expect(result.candidates).toEqual([
      { durationMinutes: 60, count: 5 },
      { durationMinutes: 45, count: 3 },
      { durationMinutes: 25, count: 2 },
    ]);
  });

  it('3-way tie: 10/10/10, 20/20/20, 30/30/30 は duration 昇順で [10, 20, 30]', () => {
    const result = computeDurationDistribution(
      makeSamples([10, 10, 10, 20, 20, 20, 30, 30, 30, 40, 40, 40]),
    );
    expect(result.candidates).toEqual([
      { durationMinutes: 10, count: 3 },
      { durationMinutes: 20, count: 3 },
      { durationMinutes: 30, count: 3 },
    ]);
  });

  it('variance: sampleSize 9 は計算せず flag false 固定', () => {
    const result = computeDurationDistribution(makeSamples([5, 10, 30, 60, 120, 240, 5, 120, 240]));
    expect(result.sampleSize).toBe(9);
    expect(result.varianceFlag).toBe(false);
  });

  it('variance: sampleSize 10 + std/mean > 0.6 で flag true', () => {
    const result = computeDurationDistribution(
      makeSamples([5, 10, 15, 30, 45, 90, 120, 180, 240, 5]),
    );
    expect(result.sampleSize).toBe(10);
    expect(result.varianceFlag).toBe(true);
  });

  it('variance: sampleSize 10 + std/mean <= 0.6 で flag false', () => {
    const result = computeDurationDistribution(
      makeSamples([55, 60, 60, 60, 60, 60, 60, 60, 60, 65]),
    );
    expect(result.sampleSize).toBe(10);
    expect(result.varianceFlag).toBe(false);
  });

  it('HighVariance 変数分布 (12 件) は varianceFlag true', () => {
    const result = computeDurationDistribution(
      makeSamples([5, 10, 15, 30, 45, 90, 120, 180, 240, 15, 30, 60]),
    );
    expect(result.sampleSize).toBe(12);
    expect(result.varianceFlag).toBe(true);
  });

  it('5 分スナップ: 13 は 15 に、17 は 15 に集約される', () => {
    const result = computeDurationDistribution(makeSamples([13, 17, 15, 15]));
    const bucket15 = result.bins.find((b) => b.durationMinutes === 15);
    expect(bucket15?.count).toBe(4);
  });

  it('0 分以下のサンプルは除外される', () => {
    const result = computeDurationDistribution(makeSamples([0, -5, 30]));
    expect(result.bins).toEqual([{ durationMinutes: 30, count: 1 }]);
  });

  it('bins は duration 昇順で返る', () => {
    const result = computeDurationDistribution(makeSamples([60, 30, 120, 45]));
    expect(result.bins.map((b) => b.durationMinutes)).toEqual([30, 45, 60, 120]);
  });
});
