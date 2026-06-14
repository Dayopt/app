import { describe, expect, it } from 'vitest';

import { transformEnergyMapResponse } from '../statistics-energy-map-transform';

describe('transformEnergyMapResponse', () => {
  it('null 入力 → 空配列', () => {
    expect(transformEnergyMapResponse(null)).toEqual([]);
  });

  it('undefined 入力 → 空配列', () => {
    expect(transformEnergyMapResponse(undefined)).toEqual([]);
  });

  it('空配列 → 空配列', () => {
    expect(transformEnergyMapResponse([])).toEqual([]);
  });

  it('単一 row: snake → camel の rename を確認', () => {
    const result = transformEnergyMapResponse([
      {
        hour: 9,
        dow: 1,
        total_minutes: 120,
        entry_count: 3,
      },
    ]);
    expect(result).toEqual([{ hour: 9, dow: 1, totalMinutes: 120, entryCount: 3 }]);
  });

  it('複数 row: 順序保持', () => {
    const result = transformEnergyMapResponse([
      { hour: 9, dow: 1, total_minutes: 60, entry_count: 1 },
      { hour: 10, dow: 1, total_minutes: 90, entry_count: 2 },
      { hour: 11, dow: 1, total_minutes: 30, entry_count: 1 },
    ]);
    expect(result.map((r) => r.hour)).toEqual([9, 10, 11]);
  });

  it('output shape に snake_case key は含まれない', () => {
    const result = transformEnergyMapResponse([
      { hour: 9, dow: 1, total_minutes: 60, entry_count: 1 },
    ]);
    const item = result[0]!;
    expect('total_minutes' in item).toBe(false);
    expect('entry_count' in item).toBe(false);
  });
});
