import { describe, expect, it } from 'vitest';

import {
  computeAvailableMinutesInclusive,
  computeBlankRate,
  computeContextSwitches,
  groupEnergyMap,
  groupHoursByDay,
  groupHoursByMonth,
  groupMinutesByDow,
  groupMinutesByHour,
  minutesBetween,
} from './statistics-service-grouping';

const TZ = 'Asia/Tokyo';

describe('minutesBetween', () => {
  it('分単位の差分を返す', () => {
    expect(minutesBetween('2026-07-01T00:00:00Z', '2026-07-01T01:30:00Z')).toBe(90);
  });
});

describe('groupMinutesByHour', () => {
  it('JST の時刻で hour バケットに集計する', () => {
    // 2026-07-01T00:00:00Z = 2026-07-01T09:00:00+09:00
    const rows = [
      { start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T00:30:00Z' },
      { start_at: '2026-07-01T00:15:00Z', end_at: '2026-07-01T00:45:00Z' },
    ];
    const result = groupMinutesByHour(rows, TZ);
    expect(result).toEqual([{ hour: 9, total_minutes: 60 }]);
  });
});

describe('groupMinutesByDow', () => {
  it('JST の曜日で dow バケットに集計する（0=日,...,6=土）', () => {
    // 2026-07-01 は水曜日 → dow=3
    const rows = [{ start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T01:00:00Z' }];
    expect(groupMinutesByDow(rows, TZ)).toEqual([{ dow: 3, total_minutes: 60 }]);
  });

  it('日曜は dow=0 になる', () => {
    // 2026-07-05 は日曜日
    const rows = [{ start_at: '2026-07-05T00:00:00Z', end_at: '2026-07-05T01:00:00Z' }];
    expect(groupMinutesByDow(rows, TZ)).toEqual([{ dow: 0, total_minutes: 60 }]);
  });
});

describe('groupHoursByDay', () => {
  it('日別に時間を集計し 2 桁で丸める', () => {
    const rows = [
      { start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T00:20:00Z' },
      { start_at: '2026-07-01T01:00:00Z', end_at: '2026-07-01T01:10:00Z' },
    ];
    const result = groupHoursByDay(rows, TZ);
    expect(result).toEqual([{ day: '2026-07-01', hours: 0.5 }]);
  });

  it('day 昇順でソートする', () => {
    const rows = [
      { start_at: '2026-07-02T00:00:00Z', end_at: '2026-07-02T01:00:00Z' },
      { start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T01:00:00Z' },
    ];
    expect(groupHoursByDay(rows, TZ).map((r) => r.day)).toEqual(['2026-07-01', '2026-07-02']);
  });
});

describe('groupHoursByMonth', () => {
  it('月別に時間を集計する', () => {
    const rows = [
      { start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T02:00:00Z' },
      { start_at: '2026-08-01T00:00:00Z', end_at: '2026-08-01T01:00:00Z' },
    ];
    expect(groupHoursByMonth(rows, TZ)).toEqual([
      { month: '2026-07', hours: 2 },
      { month: '2026-08', hours: 1 },
    ]);
  });
});

describe('groupEnergyMap', () => {
  it('(hour, dow) ごとに合計分・件数を集計する', () => {
    const rows = [
      { start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T00:30:00Z' },
      { start_at: '2026-07-01T00:10:00Z', end_at: '2026-07-01T00:40:00Z' },
    ];
    const result = groupEnergyMap(rows, TZ);
    expect(result).toEqual([{ hour: 9, dow: 3, totalMinutes: 60, recordCount: 2 }]);
  });
});

describe('computeContextSwitches', () => {
  it('同一日内でタグが変わるたびに switch を数える', () => {
    const rows = [
      { activity_id: 'a', start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T00:30:00Z' },
      { activity_id: 'b', start_at: '2026-07-01T01:00:00Z', end_at: '2026-07-01T01:30:00Z' },
      { activity_id: 'b', start_at: '2026-07-01T02:00:00Z', end_at: '2026-07-01T02:30:00Z' },
      { activity_id: 'a', start_at: '2026-07-01T03:00:00Z', end_at: '2026-07-01T03:30:00Z' },
    ];
    // a→b(switch) b→b(no) b→a(switch) = 2 switches, 1 active day
    expect(computeContextSwitches(rows, TZ)).toEqual({ totalSwitches: 2, avgPerDay: 2 });
  });

  it('null tag から値 tag への遷移も switch として数える', () => {
    const rows = [
      { activity_id: null, start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-01T00:30:00Z' },
      { activity_id: 'a', start_at: '2026-07-01T01:00:00Z', end_at: '2026-07-01T01:30:00Z' },
    ];
    expect(computeContextSwitches(rows, TZ).totalSwitches).toBe(1);
  });

  it('行が無い場合は 0 件・avgPerDay も 0（0 除算しない）', () => {
    expect(computeContextSwitches([], TZ)).toEqual({ totalSwitches: 0, avgPerDay: 0 });
  });
});

describe('computeBlankRate', () => {
  it('start/end 指定時は日数で available minutes を計算する', () => {
    const result = computeBlankRate(60, {
      startDate: '2026-07-01T00:00:00Z',
      endDate: '2026-07-02T00:00:00Z',
      wakeHour: 7,
      sleepHour: 23,
    });
    // 1日 * (23-7)*60 = 960分
    expect(result).toEqual({
      availableMinutes: 960,
      scheduledMinutes: 60,
      blankMinutes: 900,
      blankRate: 900 / 960,
    });
  });

  it('start/end 未指定時は 7 日として計算する', () => {
    const result = computeBlankRate(0, { wakeHour: 7, sleepHour: 23 });
    expect(result.availableMinutes).toBe((23 - 7) * 60 * 7);
  });

  it('sleepHour <= wakeHour の日跨ぎケースを計算する', () => {
    const result = computeBlankRate(0, { wakeHour: 22, sleepHour: 6 });
    // (24-22+6)*60 = 480分/日 * 7日
    expect(result.availableMinutes).toBe(480 * 7);
  });

  it('scheduledMinutes が available を超えても blankMinutes は 0 未満にならない', () => {
    const result = computeBlankRate(100_000, {
      startDate: '2026-07-01T00:00:00Z',
      endDate: '2026-07-02T00:00:00Z',
      wakeHour: 7,
      sleepHour: 23,
    });
    expect(result.blankMinutes).toBe(0);
  });
});

describe('computeAvailableMinutesInclusive', () => {
  it('start/end が同日なら 1 日分を返す', () => {
    const result = computeAvailableMinutesInclusive({
      startDate: '2026-07-01T00:00:00Z',
      endDate: '2026-07-01T12:00:00Z',
      wakeHour: 7,
      sleepHour: 23,
      timezone: 'UTC',
    });
    expect(result).toBe((23 - 7) * 60);
  });

  it('start/end が 3 日分なら inclusive に 3 日分を返す', () => {
    const result = computeAvailableMinutesInclusive({
      startDate: '2026-07-01T00:00:00Z',
      endDate: '2026-07-03T23:00:00Z',
      wakeHour: 7,
      sleepHour: 23,
      timezone: 'UTC',
    });
    expect(result).toBe((23 - 7) * 60 * 3);
  });
});
