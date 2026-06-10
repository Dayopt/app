import { describe, expect, it } from 'vitest';

import { computeDailySummary, type DailySummaryEntry } from '../dailySummary';

function entry(overrides: Partial<DailySummaryEntry>): DailySummaryEntry {
  return {
    start_time: null,
    end_time: null,
    actual_start_time: null,
    actual_end_time: null,
    fulfillment_score: null,
    ...overrides,
  };
}

describe('computeDailySummary', () => {
  it('空配列はゼロサマリー（予定も実績もゼロは達成率 1）', () => {
    const result = computeDailySummary([]);
    expect(result).toEqual({
      plannedMinutes: 0,
      actualMinutes: 0,
      planAccuracy: 1,
      avgFulfillment: null,
      estimationBiasMinutes: null,
    });
  });

  it('予定と実績の合計を分で集計する', () => {
    const result = computeDailySummary([
      entry({
        start_time: '2026-06-10T09:00:00Z',
        end_time: '2026-06-10T10:00:00Z',
        actual_start_time: '2026-06-10T09:00:00Z',
        actual_end_time: '2026-06-10T10:30:00Z',
      }),
      entry({
        start_time: '2026-06-10T13:00:00Z',
        end_time: '2026-06-10T14:00:00Z',
      }),
    ]);
    expect(result.plannedMinutes).toBe(120);
    expect(result.actualMinutes).toBe(90);
  });

  it('計画達成率は 1 - |予定 - 実績| / 予定（deriveAccuracy と同式）', () => {
    const result = computeDailySummary([
      entry({
        start_time: '2026-06-10T09:00:00Z',
        end_time: '2026-06-10T11:00:00Z', // 予定 120 分
        actual_start_time: '2026-06-10T09:00:00Z',
        actual_end_time: '2026-06-10T10:30:00Z', // 実績 90 分
      }),
    ]);
    expect(result.planAccuracy).toBeCloseTo(0.75);
  });

  it('予定ゼロで実績ありは達成率 0', () => {
    const result = computeDailySummary([
      entry({
        actual_start_time: '2026-06-10T09:00:00Z',
        actual_end_time: '2026-06-10T10:00:00Z',
      }),
    ]);
    expect(result.planAccuracy).toBe(0);
  });

  it('見積もりずれは予定・実績の両方を持つエントリだけで平均する', () => {
    const result = computeDailySummary([
      // +30 分超過
      entry({
        start_time: '2026-06-10T09:00:00Z',
        end_time: '2026-06-10T10:00:00Z',
        actual_start_time: '2026-06-10T09:00:00Z',
        actual_end_time: '2026-06-10T10:30:00Z',
      }),
      // -10 分早く終了
      entry({
        start_time: '2026-06-10T13:00:00Z',
        end_time: '2026-06-10T14:00:00Z',
        actual_start_time: '2026-06-10T13:00:00Z',
        actual_end_time: '2026-06-10T13:50:00Z',
      }),
      // 実績のみ（平均には入らない）
      entry({
        actual_start_time: '2026-06-10T15:00:00Z',
        actual_end_time: '2026-06-10T16:00:00Z',
      }),
    ]);
    expect(result.estimationBiasMinutes).toBeCloseTo(10);
  });

  it('充実度はスコア付きエントリだけで平均する', () => {
    const result = computeDailySummary([
      entry({ fulfillment_score: 3 }),
      entry({ fulfillment_score: 2 }),
      entry({ fulfillment_score: null }),
    ]);
    expect(result.avgFulfillment).toBeCloseTo(2.5);
  });

  it('開始 >= 終了の不正な時間は無視する', () => {
    const result = computeDailySummary([
      entry({
        start_time: '2026-06-10T10:00:00Z',
        end_time: '2026-06-10T09:00:00Z',
      }),
    ]);
    expect(result.plannedMinutes).toBe(0);
    expect(result.planAccuracy).toBe(1);
  });
});
