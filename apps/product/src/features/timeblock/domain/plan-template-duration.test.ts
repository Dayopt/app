import { describe, expect, it } from 'vitest';

import {
  aggregateActivityMedianDurations,
  MAX_TEMPLATE_BLOCK_MINUTES,
  MIN_TEMPLATE_BLOCK_MINUTES,
  normalizeTemplateBlockMinutes,
  type TemplateDurationRecordRow,
} from './plan-template-duration';

const ACTIVITY_A = 'a1';
const ACTIVITY_B = 'b1';

function record(
  activityId: string | null,
  minutes: number,
  source = 'manual',
): TemplateDurationRecordRow {
  const start = new Date('2026-09-01T00:00:00Z');
  return {
    activity_id: activityId,
    source,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
  };
}

describe('aggregateActivityMedianDurations', () => {
  it('0 / 1 / 2 件の activity は沈黙する（Map に入らない）', () => {
    expect(aggregateActivityMedianDurations([]).size).toBe(0);
    expect(aggregateActivityMedianDurations([record(ACTIVITY_A, 30)]).has(ACTIVITY_A)).toBe(false);
    expect(
      aggregateActivityMedianDurations([record(ACTIVITY_A, 30), record(ACTIVITY_A, 60)]).has(
        ACTIVITY_A,
      ),
    ).toBe(false);
  });

  it('3 件で中央値を採る', () => {
    const result = aggregateActivityMedianDurations([
      record(ACTIVITY_A, 20),
      record(ACTIVITY_A, 90),
      record(ACTIVITY_A, 45),
    ]);
    expect(result.get(ACTIVITY_A)).toBe(45);
  });

  it('偶数件は中央 2 件の平均を 5 分刻みへ丸める（40, 50 → 45）', () => {
    const result = aggregateActivityMedianDurations([
      record(ACTIVITY_A, 10),
      record(ACTIVITY_A, 40),
      record(ACTIVITY_A, 50),
      record(ACTIVITY_A, 120),
    ]);
    expect(result.get(ACTIVITY_A)).toBe(45);
  });

  it('5 分刻みに丸める（47 → 45、48 → 50）', () => {
    expect(
      aggregateActivityMedianDurations([
        record(ACTIVITY_A, 47),
        record(ACTIVITY_A, 47),
        record(ACTIVITY_A, 47),
      ]).get(ACTIVITY_A),
    ).toBe(45);
    expect(
      aggregateActivityMedianDurations([
        record(ACTIVITY_B, 48),
        record(ACTIVITY_B, 48),
        record(ACTIVITY_B, 48),
      ]).get(ACTIVITY_B),
    ).toBe(50);
  });

  it('auto_migrated / activity 無し / 長さ 0 以下は数えない', () => {
    const result = aggregateActivityMedianDurations([
      record(ACTIVITY_A, 30),
      record(ACTIVITY_A, 30),
      record(ACTIVITY_A, 30, 'auto_migrated'),
      record(null, 30),
      record(ACTIVITY_A, 0),
      record(ACTIVITY_A, -10),
    ]);
    expect(result.has(ACTIVITY_A)).toBe(false);
  });

  it('activity ごとに独立して集計する', () => {
    const result = aggregateActivityMedianDurations([
      record(ACTIVITY_A, 30),
      record(ACTIVITY_A, 30),
      record(ACTIVITY_A, 30),
      record(ACTIVITY_B, 90),
      record(ACTIVITY_B, 90),
      record(ACTIVITY_B, 90),
    ]);
    expect(result.get(ACTIVITY_A)).toBe(30);
    expect(result.get(ACTIVITY_B)).toBe(90);
  });

  it('異常に長い Record は上限で cap する', () => {
    const result = aggregateActivityMedianDurations([
      record(ACTIVITY_A, 20 * 60),
      record(ACTIVITY_A, 20 * 60),
      record(ACTIVITY_A, 20 * 60),
    ]);
    expect(result.get(ACTIVITY_A)).toBe(MAX_TEMPLATE_BLOCK_MINUTES);
  });
});

describe('normalizeTemplateBlockMinutes', () => {
  it('[MIN, MAX] に収め、5 分刻みへ丸める', () => {
    expect(normalizeTemplateBlockMinutes(1)).toBe(MIN_TEMPLATE_BLOCK_MINUTES);
    expect(normalizeTemplateBlockMinutes(62)).toBe(60);
    expect(normalizeTemplateBlockMinutes(63)).toBe(65);
    expect(normalizeTemplateBlockMinutes(10_000)).toBe(MAX_TEMPLATE_BLOCK_MINUTES);
  });
});
