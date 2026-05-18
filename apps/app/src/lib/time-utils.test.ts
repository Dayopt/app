import { describe, expect, it } from 'vitest';

import { computeDuration, formatDurationDisplay } from './time-utils';

describe('time-utils', () => {
  describe('computeDuration', () => {
    it('正常な開始・終了から分数を算出', () => {
      expect(computeDuration('09:00', '10:00')).toBe(60);
      expect(computeDuration('09:00', '09:30')).toBe(30);
      expect(computeDuration('00:00', '23:59')).toBe(1439);
    });

    it('同時刻は0', () => {
      expect(computeDuration('10:00', '10:00')).toBe(0);
    });

    it('終了が開始より前は0', () => {
      expect(computeDuration('10:00', '09:00')).toBe(0);
    });

    it('空文字は0', () => {
      expect(computeDuration('', '10:00')).toBe(0);
      expect(computeDuration('09:00', '')).toBe(0);
    });

    it('不正な入力は0', () => {
      expect(computeDuration('abc', '10:00')).toBe(0);
    });
  });

  describe('formatDurationDisplay', () => {
    it('時間と分の表示', () => {
      expect(formatDurationDisplay(90)).toBe('1h 30m');
    });

    it('時間のみ', () => {
      expect(formatDurationDisplay(120)).toBe('2h');
    });

    it('分のみ', () => {
      expect(formatDurationDisplay(45)).toBe('45m');
    });

    it('0以下は空文字', () => {
      expect(formatDurationDisplay(0)).toBe('');
      expect(formatDurationDisplay(-10)).toBe('');
    });
  });
});
