import { describe, expect, it } from 'vitest';

import {
  addMinutesToTime,
  DEFAULT_SNAP_INTERVAL,
  formatTimeString,
  parseTimeString,
  pixelsToTime,
  snapToGrid,
  timeToPixels,
} from './time-math';

const HOUR_HEIGHT = 60; // 1px = 1 分でテストしやすい

describe('pixelsToTime', () => {
  it('0px → 00:00', () => {
    expect(pixelsToTime(0, HOUR_HEIGHT)).toEqual({ hour: 0, minute: 0 });
  });

  it('60px → 01:00（hourHeight=60 なら）', () => {
    expect(pixelsToTime(60, HOUR_HEIGHT)).toEqual({ hour: 1, minute: 0 });
  });

  it('15 分単位にスナップする（デフォルト 15 分）', () => {
    // 1px=1分なので 7px → 7分 → スナップで 0 分
    expect(pixelsToTime(7, HOUR_HEIGHT)).toEqual({ hour: 0, minute: 0 });
    // 8px → 8分 → スナップで 15 分
    expect(pixelsToTime(8, HOUR_HEIGHT)).toEqual({ hour: 0, minute: 15 });
  });

  it('snapInterval=30 に変更できる', () => {
    expect(pixelsToTime(20, HOUR_HEIGHT, 30)).toEqual({ hour: 0, minute: 30 });
    expect(pixelsToTime(40, HOUR_HEIGHT, 30)).toEqual({ hour: 0, minute: 30 });
  });

  it('負の Y 座標は 0 にクランプされる', () => {
    expect(pixelsToTime(-100, HOUR_HEIGHT)).toEqual({ hour: 0, minute: 0 });
  });

  it('hour 上限は 23 にクランプされる', () => {
    // 100h 相当でも 23 時を超えない
    expect(pixelsToTime(100 * HOUR_HEIGHT, HOUR_HEIGHT).hour).toBe(23);
  });

  it('スナップで minute=60 になった場合は次の hour に繰り上がる', () => {
    // hourDecimal = 0.99, minute fraction = 59.4 → snap to 60 → 0 分 / 1 時
    expect(pixelsToTime(59, HOUR_HEIGHT)).toEqual({ hour: 1, minute: 0 });
  });

  it('23時台の繰り上がりは 23:00 で止まる（00:00 の翌日にならない）', () => {
    // 23:55 相当（59.4 分繰り上がり） → 24 時にせず 23:00 にクランプ
    const result = pixelsToTime(23 * HOUR_HEIGHT + 59, HOUR_HEIGHT);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it('DEFAULT_SNAP_INTERVAL は 15', () => {
    expect(DEFAULT_SNAP_INTERVAL).toBe(15);
  });
});

describe('timeToPixels', () => {
  it('00:00 → 0px', () => {
    expect(timeToPixels(0, 0, HOUR_HEIGHT)).toBe(0);
  });

  it('01:30 → 1.5 * hourHeight', () => {
    expect(timeToPixels(1, 30, HOUR_HEIGHT)).toBe(90);
  });

  it('hourHeight に比例する', () => {
    expect(timeToPixels(2, 0, 100)).toBe(200);
  });
});

describe('snapToGrid', () => {
  it('pixelsToTime + timeToPixels の組み合わせで snappedTop / hour / minute を返す', () => {
    const result = snapToGrid(8, HOUR_HEIGHT);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(15);
    expect(result.snappedTop).toBe(15); // 0h + 15min @ 1px/min
  });

  it('intervalMin を上書きできる', () => {
    const result = snapToGrid(20, HOUR_HEIGHT, 30);
    expect(result.minute).toBe(30);
    expect(result.snappedTop).toBe(30);
  });
});

describe('formatTimeString', () => {
  it('24h 形式（デフォルト）', () => {
    expect(formatTimeString(9, 5)).toBe('09:05');
    expect(formatTimeString(14, 30)).toBe('14:30');
    expect(formatTimeString(0, 0)).toBe('00:00');
    expect(formatTimeString(23, 59)).toBe('23:59');
  });

  it('12h 形式: AM / PM 切替', () => {
    expect(formatTimeString(9, 5, '12h')).toBe('9:05 AM');
    expect(formatTimeString(14, 30, '12h')).toBe('2:30 PM');
  });

  it('12h 形式: 0 時は 12:00 AM', () => {
    expect(formatTimeString(0, 0, '12h')).toBe('12:00 AM');
  });

  it('12h 形式: 12 時は 12:00 PM', () => {
    expect(formatTimeString(12, 0, '12h')).toBe('12:00 PM');
  });
});

describe('parseTimeString', () => {
  it('"HH:mm" を {hour, minute} にパースする', () => {
    expect(parseTimeString('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseTimeString('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeString('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('1 桁時間も許容する', () => {
    expect(parseTimeString('9:30')).toEqual({ hour: 9, minute: 30 });
  });

  it('範囲外の時刻は null', () => {
    expect(parseTimeString('24:00')).toBeNull();
    expect(parseTimeString('12:60')).toBeNull();
    expect(parseTimeString('-1:00')).toBeNull();
  });

  it('フォーマット不一致は null', () => {
    expect(parseTimeString('9-30')).toBeNull();
    expect(parseTimeString('abc')).toBeNull();
    expect(parseTimeString('')).toBeNull();
    expect(parseTimeString('9:5')).toBeNull(); // 分は 2 桁必須
  });
});

describe('addMinutesToTime', () => {
  it('単純加算', () => {
    expect(addMinutesToTime(9, 0, 30)).toEqual({ hour: 9, minute: 30 });
    expect(addMinutesToTime(9, 30, 30)).toEqual({ hour: 10, minute: 0 });
  });

  it('時を跨ぐ加算', () => {
    expect(addMinutesToTime(9, 50, 75)).toEqual({ hour: 11, minute: 5 });
  });

  it('24 時を跨ぐと % 24 で 0 時に戻る（翌日扱いはしない）', () => {
    expect(addMinutesToTime(23, 30, 60)).toEqual({ hour: 0, minute: 30 });
  });
});
