import { describe, expect, it } from 'vitest';

import {
  computeStartTimeCandidates,
  formatTimeLabel,
  type EntryRange,
} from '../computeStartTimeCandidates';

/** ローカル日付 2026-04-22 HH:MM:SS.mmm の Date を作る helper */
function at(hh: number, mm: number, ss = 0, ms = 0): Date {
  return new Date(2026, 3, 22, hh, mm, ss, ms);
}

function range(startHh: number, startMm: number, endHh: number, endMm: number): EntryRange {
  return { start: at(startHh, startMm), end: at(endHh, endMm) };
}

describe('computeStartTimeCandidates', () => {
  it('now=14:27 / no entries: now=14:27, slot30=14:30, nextFree=null (== now)', () => {
    const result = computeStartTimeCandidates(at(14, 27), []);
    expect(result.now?.getTime()).toBe(at(14, 27).getTime());
    expect(result.slot30?.getTime()).toBe(at(14, 30).getTime());
    expect(result.nextFree).toBeNull();
  });

  it('now=14:00:00.000 ジャスト / no entries: slot30==now で null, nextFree==now で null', () => {
    const result = computeStartTimeCandidates(at(14, 0), []);
    expect(result.now?.getTime()).toBe(at(14, 0).getTime());
    expect(result.slot30).toBeNull();
    expect(result.nextFree).toBeNull();
  });

  it('now=14:30:00.000 ジャスト / no entries: slot30 null, nextFree null', () => {
    const result = computeStartTimeCandidates(at(14, 30), []);
    expect(result.now?.getTime()).toBe(at(14, 30).getTime());
    expect(result.slot30).toBeNull();
    expect(result.nextFree).toBeNull();
  });

  it('now=14:27 / entry 14:00-15:00: now blocked → null, slot30=14:30, nextFree=15:00', () => {
    const result = computeStartTimeCandidates(at(14, 27), [range(14, 0, 15, 0)]);
    expect(result.now).toBeNull();
    expect(result.slot30?.getTime()).toBe(at(14, 30).getTime());
    expect(result.nextFree?.getTime()).toBe(at(15, 0).getTime());
  });

  it('now=14:27 / entry 14:00-14:30: now blocked, slot30=14:30 == nextFree=14:30 → nextFree null', () => {
    const result = computeStartTimeCandidates(at(14, 27), [range(14, 0, 14, 30)]);
    expect(result.now).toBeNull();
    expect(result.slot30?.getTime()).toBe(at(14, 30).getTime());
    expect(result.nextFree).toBeNull();
  });

  it('now=14:27 / chained entries 14:00-14:30 and 14:30-15:00: nextFree=15:00', () => {
    const result = computeStartTimeCandidates(at(14, 27), [
      range(14, 0, 14, 30),
      range(14, 30, 15, 0),
    ]);
    expect(result.now).toBeNull();
    expect(result.slot30?.getTime()).toBe(at(14, 30).getTime());
    expect(result.nextFree?.getTime()).toBe(at(15, 0).getTime());
  });

  it('now=14:30 ジャスト / entry 14:00-14:30（end == now 非 blocking）: now=14:30, slot30 null, nextFree null', () => {
    // start <= now < end の < なので now=end は blocking でない
    const result = computeStartTimeCandidates(at(14, 30), [range(14, 0, 14, 30)]);
    expect(result.now?.getTime()).toBe(at(14, 30).getTime());
    expect(result.slot30).toBeNull();
    expect(result.nextFree).toBeNull();
  });

  it('entries 順序が逆でも chain する: 14:30-15:00 先、14:00-14:30 後', () => {
    const result = computeStartTimeCandidates(at(14, 15), [
      range(14, 30, 15, 0),
      range(14, 0, 14, 30),
    ]);
    expect(result.now).toBeNull();
    expect(result.nextFree?.getTime()).toBe(at(15, 0).getTime());
  });

  it('entry が 2 重に chain: 14:00-14:30 / 14:30-15:00 / 15:00-15:30 → nextFree=15:30', () => {
    const result = computeStartTimeCandidates(at(14, 10), [
      range(14, 0, 14, 30),
      range(14, 30, 15, 0),
      range(15, 0, 15, 30),
    ]);
    expect(result.nextFree?.getTime()).toBe(at(15, 30).getTime());
  });

  it('now が entry 開始ジャスト (start == now) でも blocking 扱い', () => {
    const result = computeStartTimeCandidates(at(14, 0), [range(14, 0, 15, 0)]);
    expect(result.now).toBeNull();
    expect(result.nextFree?.getTime()).toBe(at(15, 0).getTime());
  });

  it('slot30 計算: 14:00:30 (ジャスト直後) → slot30=14:30', () => {
    const result = computeStartTimeCandidates(at(14, 0, 30), []);
    expect(result.slot30?.getTime()).toBe(at(14, 30).getTime());
  });

  it('slot30 計算: 14:29:59 → slot30=14:30', () => {
    const result = computeStartTimeCandidates(at(14, 29, 59), []);
    expect(result.slot30?.getTime()).toBe(at(14, 30).getTime());
  });

  it('slot30 計算: 14:30:01 → slot30=15:00（次の 30 分境界）', () => {
    const result = computeStartTimeCandidates(at(14, 30, 1), []);
    expect(result.slot30?.getTime()).toBe(at(15, 0).getTime());
  });

  it('slot30 が深夜の hour ロールオーバー: 23:45 → slot30=翌 00:00', () => {
    const result = computeStartTimeCandidates(at(23, 45), []);
    // 翌日 0:00
    const expected = new Date(2026, 3, 23, 0, 0).getTime();
    expect(result.slot30?.getTime()).toBe(expected);
  });
});

describe('formatTimeLabel', () => {
  it('14:05 を 2 桁ゼロ埋めで返す', () => {
    expect(formatTimeLabel(at(14, 5))).toBe('14:05');
  });

  it('00:00 を返す', () => {
    expect(formatTimeLabel(at(0, 0))).toBe('00:00');
  });

  it('23:59 を返す', () => {
    expect(formatTimeLabel(at(23, 59))).toBe('23:59');
  });
});
