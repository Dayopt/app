import { describe, expect, it } from 'vitest';

import { computeDuration, formatTimeRange } from './timeString';

describe('date/timeString', () => {
  describe('formatTimeRange', () => {
    const start = new Date(2026, 0, 15, 9, 0);
    const end = new Date(2026, 0, 15, 17, 30);

    it('既定の区切り（en-dash・スペースなし）で 24h フォーマット', () => {
      expect(formatTimeRange(start, end, '24h')).toBe('09:00–17:30');
    });

    it('12h フォーマット', () => {
      expect(formatTimeRange(start, end, '12h')).toBe('9:00 AM–5:30 PM');
    });

    it('区切り文字を指定できる（スペース付き en-dash / 波ダッシュ）', () => {
      expect(formatTimeRange(start, end, '24h', ' – ')).toBe('09:00 – 17:30');
      expect(formatTimeRange(start, end, '24h', ' 〜 ')).toBe('09:00 〜 17:30');
    });
  });

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
