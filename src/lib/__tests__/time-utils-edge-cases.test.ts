import { describe, expect, it } from 'vitest';

import { computeDuration, formatDurationDisplay } from '../time-utils';

describe('computeDuration — エッジケース', () => {
  it('真夜中をまたぐ HH:MM（23:59 → 00:00）は負の差分 → 0', () => {
    expect(computeDuration('23:59', '00:00')).toBe(0);
  });

  it('同時刻（start === end）は 0', () => {
    expect(computeDuration('14:30', '14:30')).toBe(0);
  });

  it('00:00 → 23:59 は 1439 分（1日の最大）', () => {
    expect(computeDuration('00:00', '23:59')).toBe(1439);
  });

  it('1 分ブロック', () => {
    expect(computeDuration('09:00', '09:01')).toBe(1);
  });

  it('空文字列は 0', () => {
    expect(computeDuration('', '10:00')).toBe(0);
    expect(computeDuration('09:00', '')).toBe(0);
  });

  it('コロンなしの文字列は NaN → 0', () => {
    expect(computeDuration('0900', '1000')).toBe(0);
  });

  it('秒付き文字列（"09:00:30"）は先頭2セグメントで計算される', () => {
    // split(':') → ['09','00','30'] → startH=9, startM=0（3番目は無視）
    expect(computeDuration('09:00:30', '10:00:00')).toBe(60);
  });
});

describe('formatDurationDisplay — エッジケース', () => {
  it('1 分は "1m"', () => {
    expect(formatDurationDisplay(1)).toBe('1m');
  });

  it('59 分は "59m"', () => {
    expect(formatDurationDisplay(59)).toBe('59m');
  });

  it('60 分は "1h"（ちょうど1時間）', () => {
    expect(formatDurationDisplay(60)).toBe('1h');
  });

  it('61 分は "1h 1m"', () => {
    expect(formatDurationDisplay(61)).toBe('1h 1m');
  });

  it('1439 分（23h59m）は "23h 59m"', () => {
    expect(formatDurationDisplay(1439)).toBe('23h 59m');
  });

  it('1440 分（24h）は "24h"', () => {
    expect(formatDurationDisplay(1440)).toBe('24h');
  });

  it('負の値は空文字', () => {
    expect(formatDurationDisplay(-1)).toBe('');
    expect(formatDurationDisplay(-60)).toBe('');
  });

  it('0 は空文字', () => {
    expect(formatDurationDisplay(0)).toBe('');
  });
});
