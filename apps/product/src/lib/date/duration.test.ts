import { describe, expect, it } from 'vitest';

import { formatDurationMinutes } from './duration';

describe('date/duration', () => {
  describe('formatDurationMinutes', () => {
    // 共通入力テーブル（整数）— この canonical に統合された各 formatter は
    // 整数入力でこの出力に一致する（表示を変えない）。
    it.each([
      [0, '0m'],
      [1, '1m'],
      [45, '45m'],
      [59, '59m'],
      [60, '1h'],
      [61, '1h 1m'],
      [90, '1h 30m'],
      [119, '1h 59m'],
      [120, '2h'],
      [1439, '23h 59m'],
    ])('%i分 → %s', (input, expected) => {
      expect(formatDurationMinutes(input)).toBe(expected);
    });

    // Review の集計値（roundTo1 / 丸めなしの秒差分）は 0.1 分刻みの小数になりうる。
    // 表示直前に丸める（旧 timePL.presentation の formatMinutesDuration と同じ契約）。
    it.each([
      [90.5, '1h 31m'],
      [59.6, '60m'],
      [45.4, '45m'],
      [0.4, '0m'],
      [0.6, '1m'],
    ])('%s分（小数） → %s', (input, expected) => {
      expect(formatDurationMinutes(input)).toBe(expected);
    });

    it('負数は絶対値をフォーマット（符号は呼び出し側の責務）', () => {
      expect(formatDurationMinutes(-90)).toBe('1h 30m');
      expect(formatDurationMinutes(-45)).toBe('45m');
    });
  });
});
