import { describe, expect, it } from 'vitest';

import {
  unpackBlankRate,
  unpackContextSwitches,
  unpackCumulativeTime,
  unpackEntryRate,
} from '../statistics-kpi-unpackers';

describe('unpackCumulativeTime', () => {
  it('null → totalMinutes: 0', () => {
    expect(unpackCumulativeTime(null)).toEqual({ totalMinutes: 0 });
  });

  it('undefined → totalMinutes: 0', () => {
    expect(unpackCumulativeTime(undefined)).toEqual({ totalMinutes: 0 });
  });

  it('値あり → そのまま受け渡し', () => {
    expect(unpackCumulativeTime({ totalMinutes: 600 })).toEqual({ totalMinutes: 600 });
  });

  it('実値 0 → default と区別される (そのまま 0)', () => {
    expect(unpackCumulativeTime({ totalMinutes: 0 })).toEqual({ totalMinutes: 0 });
  });
});

describe('unpackEntryRate', () => {
  it('null → 全 default (0)', () => {
    expect(unpackEntryRate(null)).toEqual({
      totalEntries: 0,
      plannedEntries: 0,
      entryRate: 0,
    });
  });

  it('planRate → entryRate に rename される', () => {
    expect(unpackEntryRate({ totalEntries: 30, plannedEntries: 25, planRate: 0.83 })).toEqual({
      totalEntries: 30,
      plannedEntries: 25,
      entryRate: 0.83,
    });
  });

  it('output に planRate field は含まれない', () => {
    const result = unpackEntryRate({ totalEntries: 30, plannedEntries: 25, planRate: 0.83 });
    expect('planRate' in result).toBe(false);
    expect('entryRate' in result).toBe(true);
  });

  it('実値 0 → default と区別される', () => {
    expect(unpackEntryRate({ totalEntries: 0, plannedEntries: 0, planRate: 0 })).toEqual({
      totalEntries: 0,
      plannedEntries: 0,
      entryRate: 0,
    });
  });
});

describe('unpackContextSwitches', () => {
  it('null → 全 0', () => {
    expect(unpackContextSwitches(null)).toEqual({ totalSwitches: 0, avgPerDay: 0 });
  });

  it('値あり → そのまま受け渡し', () => {
    expect(unpackContextSwitches({ totalSwitches: 12, avgPerDay: 1.5 })).toEqual({
      totalSwitches: 12,
      avgPerDay: 1.5,
    });
  });

  it('部分: totalSwitches のみ → avgPerDay は 0', () => {
    expect(unpackContextSwitches({ totalSwitches: 5 })).toEqual({
      totalSwitches: 5,
      avgPerDay: 0,
    });
  });
});

describe('unpackBlankRate', () => {
  it('null → 全 0', () => {
    expect(unpackBlankRate(null)).toEqual({
      availableMinutes: 0,
      scheduledMinutes: 0,
      blankMinutes: 0,
      blankRate: 0,
    });
  });

  it('値あり → そのまま受け渡し', () => {
    expect(
      unpackBlankRate({
        availableMinutes: 480,
        scheduledMinutes: 360,
        blankMinutes: 120,
        blankRate: 0.25,
      }),
    ).toEqual({
      availableMinutes: 480,
      scheduledMinutes: 360,
      blankMinutes: 120,
      blankRate: 0.25,
    });
  });

  it('部分: blankRate のみ → 他は 0', () => {
    expect(unpackBlankRate({ blankRate: 0.5 })).toEqual({
      availableMinutes: 0,
      scheduledMinutes: 0,
      blankMinutes: 0,
      blankRate: 0.5,
    });
  });

  it('undefined → 全 0', () => {
    expect(unpackBlankRate(undefined)).toEqual({
      availableMinutes: 0,
      scheduledMinutes: 0,
      blankMinutes: 0,
      blankRate: 0,
    });
  });
});
