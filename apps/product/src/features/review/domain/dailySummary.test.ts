import { describe, expect, it } from 'vitest';

import { computeDailySummary, type DailySummaryTimeblock } from './dailySummary';

function entry(overrides: Partial<DailySummaryTimeblock>): DailySummaryTimeblock {
  return {
    origin: 'planned',
    start_time: null,
    end_time: null,
    actual_start_time: null,
    actual_end_time: null,
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
      estimationBiasMinutes: null,
      estimationSampleCount: 0,
      unplannedMinutes: 0,
      unplannedCount: 0,
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
    expect(result.estimationSampleCount).toBe(2);
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

  it('計画外（unplanned）の実績を合計と件数で集計する', () => {
    const result = computeDailySummary([
      entry({
        origin: 'unplanned',
        actual_start_time: '2026-06-10T09:00:00Z',
        actual_end_time: '2026-06-10T10:00:00Z',
      }),
      entry({
        origin: 'unplanned',
        actual_start_time: '2026-06-10T13:00:00Z',
        actual_end_time: '2026-06-10T13:30:00Z',
      }),
      // planned は計画外に数えない
      entry({
        start_time: '2026-06-10T15:00:00Z',
        end_time: '2026-06-10T16:00:00Z',
        actual_start_time: '2026-06-10T15:00:00Z',
        actual_end_time: '2026-06-10T16:00:00Z',
      }),
    ]);
    expect(result.unplannedMinutes).toBe(90);
    expect(result.unplannedCount).toBe(2);
  });
});
