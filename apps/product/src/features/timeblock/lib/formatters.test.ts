import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatRelativeTime,
  formatTimeblockDate,
  formatTimeblockDateTime,
  formatTimeblockNumber,
} from './formatters';

describe('formatters', () => {
  describe('formatTimeblockNumber', () => {
    it('TKT-YYYYMMDD-XXX形式を#TKT-XXXに変換する', () => {
      expect(formatTimeblockNumber('TKT-20241030-001')).toBe('#TKT-001');
    });

    it('TKT-YYYYMMDD-XXX形式で3桁以上の番号も正しく変換する', () => {
      expect(formatTimeblockNumber('TKT-20241030-123')).toBe('#TKT-123');
    });

    it('パーツが3つでない場合はそのまま#を付けて返す', () => {
      expect(formatTimeblockNumber('TKT-001')).toBe('#TKT-001');
    });

    it('単一の文字列は#を付けて返す', () => {
      expect(formatTimeblockNumber('ABC')).toBe('#ABC');
    });
  });

  describe('formatTimeblockDate', () => {
    describe('日本語 (locale: ja)', () => {
      it('YYYY-MM-DD形式をYYYY/MM/DD形式に変換する', () => {
        const result = formatTimeblockDate('2025-01-15', 'ja');
        expect(result).toMatch(/2025\/1\/15/);
      });

      it('ISO 8601形式も正しく変換する', () => {
        const result = formatTimeblockDate('2025-12-25T00:00:00Z', 'ja');
        expect(result).toMatch(/2025\/12\/2[45]/);
      });
    });

    describe('英語 (locale: en)', () => {
      it('YYYY-MM-DD形式をMM DD, YYYY形式に変換する', () => {
        const result = formatTimeblockDate('2025-01-15', 'en');
        expect(result).toMatch(/Jan 15, 2025/);
      });

      it('ISO 8601形式も正しく変換する', () => {
        const result = formatTimeblockDate('2025-12-25T00:00:00Z', 'en');
        expect(result).toMatch(/Dec 2[45], 2025/);
      });
    });

    describe('デフォルト動作', () => {
      it('localeを指定しない場合はenがデフォルト', () => {
        const result = formatTimeblockDate('2025-01-15');
        expect(result).toMatch(/Jan 15, 2025/);
      });

      it('nullの場合は-を返す', () => {
        expect(formatTimeblockDate(null)).toBe('-');
      });

      it('undefinedの場合は-を返す', () => {
        expect(formatTimeblockDate(undefined)).toBe('-');
      });

      it('空文字列の場合は-を返す', () => {
        expect(formatTimeblockDate('')).toBe('-');
      });
    });
  });

  describe('formatTimeblockDateTime', () => {
    it('ISO 8601形式をYYYY/MM/DD HH:mmに変換する', () => {
      // ローカルタイムゾーンでテスト
      const date = new Date(2025, 0, 15, 9, 30); // 2025-01-15 09:30
      const isoString = date.toISOString();
      const result = formatTimeblockDateTime(isoString);
      expect(result).toBe('2025/01/15 09:30');
    });

    it('nullの場合は-を返す', () => {
      expect(formatTimeblockDateTime(null)).toBe('-');
    });

    it('undefinedの場合は-を返す', () => {
      expect(formatTimeblockDateTime(undefined)).toBe('-');
    });

    it('空文字列の場合は-を返す', () => {
      expect(formatTimeblockDateTime('')).toBe('-');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // 現在時刻を固定
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('日本語 (locale: ja)', () => {
      it('1分未満は「たった今」を返す', () => {
        const date = new Date('2025-01-15T11:59:30Z').toISOString();
        expect(formatRelativeTime(date, 'ja')).toBe('たった今');
      });

      it('1分以上60分未満は「X分前」を返す', () => {
        const date = new Date('2025-01-15T11:30:00Z').toISOString();
        expect(formatRelativeTime(date, 'ja')).toBe('30分前');
      });

      it('1時間以上24時間未満は「X時間前」を返す', () => {
        const date = new Date('2025-01-15T09:00:00Z').toISOString();
        expect(formatRelativeTime(date, 'ja')).toBe('3時間前');
      });

      it('1日以上30日未満は「X日前」を返す', () => {
        const date = new Date('2025-01-10T12:00:00Z').toISOString();
        expect(formatRelativeTime(date, 'ja')).toBe('5日前');
      });

      it('30日以上は日付形式を返す', () => {
        const date = new Date('2024-12-01T12:00:00Z').toISOString();
        const result = formatRelativeTime(date, 'ja');
        expect(result).toMatch(/2024年12月1日/);
      });
    });

    describe('英語 (locale: en)', () => {
      it('1分未満は "just now" を返す', () => {
        const date = new Date('2025-01-15T11:59:30Z').toISOString();
        expect(formatRelativeTime(date, 'en')).toBe('just now');
      });

      it('1分以上60分未満は "X min ago" を返す', () => {
        const date = new Date('2025-01-15T11:30:00Z').toISOString();
        expect(formatRelativeTime(date, 'en')).toBe('30 min ago');
      });

      it('1時間以上24時間未満は "Xh ago" を返す', () => {
        const date = new Date('2025-01-15T09:00:00Z').toISOString();
        expect(formatRelativeTime(date, 'en')).toBe('3h ago');
      });

      it('1日以上30日未満は "Xd ago" を返す', () => {
        const date = new Date('2025-01-10T12:00:00Z').toISOString();
        expect(formatRelativeTime(date, 'en')).toBe('5d ago');
      });

      it('30日以上は日付形式を返す', () => {
        const date = new Date('2024-12-01T12:00:00Z').toISOString();
        const result = formatRelativeTime(date, 'en');
        expect(result).toMatch(/Dec 1, 2024/);
      });
    });

    describe('デフォルト動作', () => {
      it('localeを指定しない場合はenがデフォルト', () => {
        const date = new Date('2025-01-15T11:59:30Z').toISOString();
        expect(formatRelativeTime(date)).toBe('just now');
      });

      it('nullの場合は-を返す', () => {
        expect(formatRelativeTime(null)).toBe('-');
      });

      it('undefinedの場合は-を返す', () => {
        expect(formatRelativeTime(undefined)).toBe('-');
      });

      it('空文字列の場合は-を返す', () => {
        expect(formatRelativeTime('')).toBe('-');
      });
    });
  });
});
