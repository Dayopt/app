import { describe, expect, it } from 'vitest';

import { type EstimationAccuracyDbRow, transformEstimationAccuracy } from '../estimation-accuracy';

function makeRow(overrides: Partial<EstimationAccuracyDbRow> = {}): EstimationAccuracyDbRow {
  return {
    tag_id: 'tag-1',
    tag_name: 'Deep Work',
    tag_color: 'blue',
    avg_planned_minutes: 60,
    avg_actual_minutes: 75,
    avg_deviation_minutes: 15,
    entry_count: 10,
    ...overrides,
  };
}

describe('transformEstimationAccuracy', () => {
  it('空配列 → 空配列', () => {
    expect(transformEstimationAccuracy([])).toEqual([]);
  });

  it('全フィールドを snake → camel に変換する', () => {
    const result = transformEstimationAccuracy([makeRow()]);
    expect(result[0]).toEqual({
      tagId: 'tag-1',
      tagName: 'Deep Work',
      tagColor: 'blue',
      avgPlannedMinutes: 60,
      avgActualMinutes: 75,
      avgDeviationMinutes: 15,
      entryCount: 10,
    });
  });

  it('tag_color が空文字 → indigo にフォールバック', () => {
    const result = transformEstimationAccuracy([makeRow({ tag_color: '' })]);
    expect(result[0]?.tagColor).toBe('indigo');
  });

  it('tag_color が値あり → そのまま保持', () => {
    const result = transformEstimationAccuracy([makeRow({ tag_color: 'crimson' })]);
    expect(result[0]?.tagColor).toBe('crimson');
  });

  it('複数 row → 各 row が独立に変換される', () => {
    const result = transformEstimationAccuracy([
      makeRow({ tag_id: 'a', tag_color: 'red' }),
      makeRow({ tag_id: 'b', tag_color: '' }),
      makeRow({ tag_id: 'c', tag_color: 'green' }),
    ]);
    expect(result.map((r) => r.tagId)).toEqual(['a', 'b', 'c']);
    expect(result.map((r) => r.tagColor)).toEqual(['red', 'indigo', 'green']);
  });

  it('0 / 負数の minutes / count を保持する', () => {
    const result = transformEstimationAccuracy([
      makeRow({
        avg_planned_minutes: 0,
        avg_actual_minutes: 0,
        avg_deviation_minutes: -30,
        entry_count: 0,
      }),
    ]);
    expect(result[0]).toMatchObject({
      avgPlannedMinutes: 0,
      avgActualMinutes: 0,
      avgDeviationMinutes: -30,
      entryCount: 0,
    });
  });
});
