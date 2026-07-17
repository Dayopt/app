import { describe, expect, it } from 'vitest';

import { formatDurationMinutes } from '../duration';

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
  });
});
