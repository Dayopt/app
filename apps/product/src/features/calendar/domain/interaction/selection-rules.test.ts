import { describe, expect, it } from 'vitest';

import { calculateSelection, createInstantSelection } from './selection-rules';

describe('calculateSelection', () => {
  it('current が start より下なら current を end として返す', () => {
    expect(calculateSelection({ hour: 9, minute: 0 }, { hour: 10, minute: 30 })).toEqual({
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 30,
    });
  });

  it('下方向のみ: current が start より手前でも最低 5 分の長さを保証する', () => {
    expect(calculateSelection({ hour: 10, minute: 0 }, { hour: 9, minute: 0 })).toEqual({
      startHour: 10,
      startMinute: 0,
      endHour: 10,
      endMinute: 5,
    });
  });

  it('current = start + 3 分のとき、最低 5 分長を確保するため end = start + 5 分', () => {
    expect(calculateSelection({ hour: 14, minute: 0 }, { hour: 14, minute: 3 })).toEqual({
      startHour: 14,
      startMinute: 0,
      endHour: 14,
      endMinute: 5,
    });
  });

  it('current = start + 7 分は 1 分粒度でそのまま end になる（15 分に丸めない）', () => {
    expect(calculateSelection({ hour: 14, minute: 0 }, { hour: 14, minute: 7 })).toEqual({
      startHour: 14,
      startMinute: 0,
      endHour: 14,
      endMinute: 7,
    });
  });

  it('current = start ジャストでも最低 5 分長を確保する', () => {
    expect(calculateSelection({ hour: 8, minute: 30 }, { hour: 8, minute: 30 })).toEqual({
      startHour: 8,
      startMinute: 30,
      endHour: 8,
      endMinute: 35,
    });
  });

  it('endHour は 23 を超えない (clamp)。endMinute は分の剰余そのまま（既存挙動）', () => {
    // current = 25:00 → endMin = 1500、endHour は 23 にクランプされるが
    // endMinute は 1500 % 60 = 0（startHour/Min は変えない）
    expect(calculateSelection({ hour: 23, minute: 0 }, { hour: 25, minute: 0 })).toEqual({
      startHour: 23,
      startMinute: 0,
      endHour: 23,
      endMinute: 0,
    });
  });

  it('start が負の minute でも clamp される（防御的）', () => {
    expect(calculateSelection({ hour: 0, minute: -10 }, { hour: 1, minute: 0 })).toEqual({
      startHour: 0,
      startMinute: 0,
      endHour: 1,
      endMinute: 0,
    });
  });
});

describe('createInstantSelection', () => {
  const date = new Date('2026-05-21T00:00:00Z');

  it('startTime + defaultDuration を end として返す', () => {
    expect(createInstantSelection({ hour: 9, minute: 0 }, date, 60)).toEqual({
      date,
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    });
  });

  it('defaultDuration が長くても 23:59 を超えない', () => {
    expect(createInstantSelection({ hour: 23, minute: 30 }, date, 120)).toEqual({
      date,
      startHour: 23,
      startMinute: 30,
      endHour: 23,
      endMinute: 59,
    });
  });

  it('minute 跨ぎ（35 + 30 = 65）で hour を繰り上げる', () => {
    expect(createInstantSelection({ hour: 10, minute: 35 }, date, 30)).toEqual({
      date,
      startHour: 10,
      startMinute: 35,
      endHour: 11,
      endMinute: 5,
    });
  });

  it('date オブジェクトはそのまま透過する', () => {
    const result = createInstantSelection({ hour: 9, minute: 0 }, date, 60);
    expect(result.date).toBe(date);
  });
});
