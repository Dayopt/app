import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateISO,
  formatDateShort,
  formatDuration,
  formatDurationMinutes,
  formatHour,
  formatTime,
} from './format';

describe('date/format', () => {
  describe('formatDate', () => {
    it('日本語ロケールでフォーマット', () => {
      const date = new Date(2026, 0, 22); // 2026-01-22
      const result = formatDate(date, 'ja');
      expect(result).toContain('2026');
      expect(result).toContain('22');
    });

    it('英語ロケールでフォーマット', () => {
      const date = new Date(2026, 0, 22);
      const result = formatDate(date, 'en');
      expect(result).toContain('2026');
      expect(result).toContain('22');
    });

    it('年なしオプション', () => {
      const date = new Date(2026, 0, 22);
      const result = formatDate(date, 'ja', { includeYear: false });
      expect(result).not.toContain('2026');
    });
  });

  describe('formatDateShort', () => {
    it('短形式でフォーマット', () => {
      const date = new Date(2026, 0, 5);
      const result = formatDateShort(date, 'ja');
      expect(result).toContain('1');
      expect(result).toContain('5');
    });
  });

  describe('formatDateISO', () => {
    it('ISO形式でフォーマット', () => {
      expect(formatDateISO(new Date(2026, 0, 22))).toBe('2026-01-22');
    });

    it('月と日が1桁の場合ゼロパディング', () => {
      expect(formatDateISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
  });

  describe('formatTime', () => {
    it('24h形式', () => {
      const date = new Date(2026, 0, 1, 14, 30);
      expect(formatTime(date, '24h')).toBe('14:30');
    });

    it('12h形式', () => {
      const date = new Date(2026, 0, 1, 14, 30);
      expect(formatTime(date, '12h')).toBe('2:30 PM');
    });

    it('0時は12h形式で12:00 AM', () => {
      const date = new Date(2026, 0, 1, 0, 0);
      expect(formatTime(date, '12h')).toBe('12:00 AM');
    });

    it('12時は12h形式で12:00 PM', () => {
      const date = new Date(2026, 0, 1, 12, 0);
      expect(formatTime(date, '12h')).toBe('12:00 PM');
    });
  });

  describe('formatHour', () => {
    it('24h形式', () => {
      expect(formatHour(14, '24h')).toBe('14:00');
      expect(formatHour(0, '24h')).toBe('0:00');
    });

    it('12h形式', () => {
      expect(formatHour(0, '12h')).toBe('12:00 AM');
      expect(formatHour(12, '12h')).toBe('12:00 PM');
      expect(formatHour(14, '12h')).toBe('2:00 PM');
      expect(formatHour(9, '12h')).toBe('9:00 AM');
    });
  });

  describe('formatDuration', () => {
    it('日本語形式', () => {
      expect(formatDuration(3661000, 'ja')).toBe('1時間1分1秒');
      expect(formatDuration(3600000, 'ja')).toBe('1時間');
      expect(formatDuration(90000, 'ja')).toBe('1分30秒');
    });

    it('英語形式', () => {
      expect(formatDuration(3661000, 'en')).toBe('1h 1m 1s');
      expect(formatDuration(3600000, 'en')).toBe('1h');
    });

    it('0ミリ秒は0秒', () => {
      expect(formatDuration(0, 'ja')).toBe('0秒');
    });
  });

  describe('formatDurationMinutes', () => {
    // 共通入力テーブル（整数）— duration formatter 統合後も canonical はこの契約を維持する。
    // 統合対象（formatDurationDisplay / formatMinutesDuration / formatMetricValue / 各 local）は
    // 整数入力でこの出力に一致する。
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
