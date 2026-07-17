import { describe, expect, it } from 'vitest';

import { computeDuration } from '../timeString';

describe('date/timeString', () => {
  describe('computeDuration', () => {
    it('正常な開始・終了から分数を算出', () => {
      expect(computeDuration('09:00', '10:00')).toBe(60);
      expect(computeDuration('09:00', '09:30')).toBe(30);
      expect(computeDuration('00:00', '23:59')).toBe(1439);
    });

    it('1 分ブロック', () => {
      expect(computeDuration('09:00', '09:01')).toBe(1);
    });

    it('同時刻は 0', () => {
      expect(computeDuration('10:00', '10:00')).toBe(0);
      expect(computeDuration('14:30', '14:30')).toBe(0);
    });

    it('終了が開始より前は 0', () => {
      expect(computeDuration('10:00', '09:00')).toBe(0);
    });

    it('真夜中をまたぐ（23:59 → 00:00）は負の差分 → 0', () => {
      expect(computeDuration('23:59', '00:00')).toBe(0);
    });

    it('空文字は 0', () => {
      expect(computeDuration('', '10:00')).toBe(0);
      expect(computeDuration('09:00', '')).toBe(0);
    });

    it('コロンなし・不正な入力は NaN → 0', () => {
      expect(computeDuration('abc', '10:00')).toBe(0);
      expect(computeDuration('0900', '1000')).toBe(0);
    });

    it('秒付き文字列（"09:00:30"）は先頭2セグメントで計算される', () => {
      expect(computeDuration('09:00:30', '10:00:00')).toBe(60);
    });
  });
});
