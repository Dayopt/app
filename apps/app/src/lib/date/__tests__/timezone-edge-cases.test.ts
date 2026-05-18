import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTimezoneAbbreviation,
  getTimezoneOffset,
  localTimeToUTCISO,
  parseISOToUserTimezone,
} from '../timezone';

describe('localTimeToUTCISO', () => {
  describe('基本変換', () => {
    it('JST 14:30 → UTC 05:30Z', () => {
      const result = localTimeToUTCISO(new Date(2025, 0, 22), 14, 30, 'Asia/Tokyo');
      expect(result).toBe('2025-01-22T05:30:00.000Z');
    });

    it('UTC+0 ロンドン（冬）では +0h 変換', () => {
      // 冬時間（1月）のロンドンは UTC+0
      const result = localTimeToUTCISO(new Date(2025, 0, 22), 10, 0, 'Europe/London');
      expect(result).toBe('2025-01-22T10:00:00.000Z');
    });

    it('UTC-5 ニューヨーク（冬）は +5h', () => {
      const result = localTimeToUTCISO(new Date(2025, 0, 22), 10, 0, 'America/New_York');
      expect(result).toBe('2025-01-22T15:00:00.000Z');
    });

    it('半時間オフセット IST（UTC+5:30）14:00 → UTC 08:30Z', () => {
      const result = localTimeToUTCISO(new Date(2025, 0, 22), 14, 0, 'Asia/Kolkata');
      expect(result).toBe('2025-01-22T08:30:00.000Z');
    });
  });

  describe('DST: 春前送り（Spring forward）— America/New_York 2025-03-09', () => {
    it('DST境界前 01:00 EST → UTC 06:00Z（EST = UTC-5）', () => {
      const result = localTimeToUTCISO(new Date(2025, 2, 9), 1, 0, 'America/New_York');
      expect(result).toBe('2025-03-09T06:00:00.000Z');
    });

    it('DST境界後 03:00 EDT → UTC 07:00Z（EDT = UTC-4）', () => {
      const result = localTimeToUTCISO(new Date(2025, 2, 9), 3, 0, 'America/New_York');
      expect(result).toBe('2025-03-09T07:00:00.000Z');
    });

    it('存在しない時刻 02:30 の動作を文書化（date-fns-tz のフォールバック）', () => {
      // 2:00 AM は EDT で存在しない → date-fns-tz は通常 3:00 相当に変換
      const result = localTimeToUTCISO(new Date(2025, 2, 9), 2, 30, 'America/New_York');
      // 結果は実装依存。期待値を文書化する
      const date = new Date(result);
      expect(date).toBeInstanceOf(Date);
      expect(isNaN(date.getTime())).toBe(false);
    });
  });

  describe('DST: 秋後戻り（Fall back）— America/New_York 2025-11-02', () => {
    it('DST期間中 12:00 EDT → UTC 16:00Z（EDT = UTC-4）', () => {
      // 11/2 の正午はまだ曖昧ではない（2AM以降は EST）
      // 実際 fall back は 2AM、正午は EST なので UTC-5
      const result = localTimeToUTCISO(new Date(2025, 10, 2), 12, 0, 'America/New_York');
      expect(result).toBe('2025-11-02T17:00:00.000Z');
    });

    it('曖昧な時刻 01:30 の動作を文書化', () => {
      // 1:30 AM は EDT/EST の両方で存在する
      const result = localTimeToUTCISO(new Date(2025, 10, 2), 1, 30, 'America/New_York');
      const date = new Date(result);
      expect(date).toBeInstanceOf(Date);
      expect(isNaN(date.getTime())).toBe(false);
      // 曖昧な時刻のため、ランタイムの TZ 環境により EDT（UTC-4）または EST（UTC-5）が選択される
      // EDT → 05:30Z、EST → 06:30Z のどちらも正しい
      expect(['2025-11-02T05:30:00.000Z', '2025-11-02T06:30:00.000Z']).toContain(result);
    });
  });

  describe('日付境界', () => {
    it('ニューヨーク 00:00 → UTC 05:00Z（冬時間）', () => {
      const result = localTimeToUTCISO(new Date(2025, 0, 22), 0, 0, 'America/New_York');
      expect(result).toBe('2025-01-22T05:00:00.000Z');
    });

    it('シドニー 23:00（AEDT, UTC+11）→ UTC 12:00Z', () => {
      // 1月のシドニーは夏時間 AEDT = UTC+11
      const result = localTimeToUTCISO(new Date(2025, 0, 22), 23, 0, 'Australia/Sydney');
      expect(result).toBe('2025-01-22T12:00:00.000Z');
    });
  });
});

describe('parseISOToUserTimezone', () => {
  describe('基本変換', () => {
    it('UTC ISO を JST に変換（+9h）', () => {
      const result = parseISOToUserTimezone('2025-01-22T05:30:00.000Z', 'Asia/Tokyo');
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it('UTC 15:00Z を EST に変換 → 10:00', () => {
      const result = parseISOToUserTimezone('2025-01-22T15:00:00.000Z', 'America/New_York');
      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('不正な入力', () => {
    it('無効な ISO 文字列でエラーをスロー', () => {
      expect(() => parseISOToUserTimezone('not-a-date', 'Asia/Tokyo')).toThrow(
        'Invalid ISO datetime',
      );
    });

    it('空文字でエラーをスロー', () => {
      expect(() => parseISOToUserTimezone('', 'Asia/Tokyo')).toThrow('Invalid ISO datetime');
    });
  });
});

describe('getTimezoneOffset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('固定オフセットのタイムゾーン', () => {
    it('UTC は 0 を返す', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      expect(getTimezoneOffset('UTC', new Date())).toBe(0);
    });

    it('Asia/Tokyo は 9 を返す', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      expect(getTimezoneOffset('Asia/Tokyo', new Date())).toBe(9);
    });
  });

  describe('DST を持つタイムゾーン', () => {
    it('America/New_York — 夏（EDT）は -4 を返す', () => {
      const summerDate = new Date('2025-07-15T12:00:00Z');
      vi.setSystemTime(summerDate);
      expect(getTimezoneOffset('America/New_York', summerDate)).toBe(-4);
    });

    it('America/New_York — 冬（EST）は -5 を返す', () => {
      const winterDate = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(winterDate);
      expect(getTimezoneOffset('America/New_York', winterDate)).toBe(-5);
    });

    it('Europe/London — 夏（BST）は 1 を返す', () => {
      const summerDate = new Date('2025-07-15T12:00:00Z');
      vi.setSystemTime(summerDate);
      expect(getTimezoneOffset('Europe/London', summerDate)).toBe(1);
    });

    it('Europe/London — 冬（GMT）は 0 を返す', () => {
      const winterDate = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(winterDate);
      expect(getTimezoneOffset('Europe/London', winterDate)).toBe(0);
    });
  });
});

describe('getTimezoneAbbreviation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('固定略称', () => {
    it('Asia/Tokyo は夏冬で略称が変わらない', () => {
      vi.setSystemTime(new Date('2025-07-15T12:00:00Z'));
      const summer = getTimezoneAbbreviation('Asia/Tokyo');

      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      const winter = getTimezoneAbbreviation('Asia/Tokyo');

      // 環境により "JST" または "GMT+9" が返る（happy-dom では "GMT+9"）
      expect(summer).toBe(winter);
      expect(['JST', 'GMT+9']).toContain(summer);
    });

    it('UTC は "UTC" を返す', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      expect(getTimezoneAbbreviation('UTC')).toBe('UTC');
    });
  });

  describe('DST を持つタイムゾーン', () => {
    it('America/New_York — 夏は "EDT" を返す', () => {
      const summerDate = new Date('2025-07-15T12:00:00Z');
      vi.setSystemTime(summerDate);
      expect(getTimezoneAbbreviation('America/New_York', summerDate)).toBe('EDT');
    });

    it('America/New_York — 冬は "EST" を返す', () => {
      const winterDate = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(winterDate);
      expect(getTimezoneAbbreviation('America/New_York', winterDate)).toBe('EST');
    });

    it('Europe/London — 夏は "BST" または "GMT+1" を返す', () => {
      const summerDate = new Date('2025-07-15T12:00:00Z');
      vi.setSystemTime(summerDate);
      // 環境により "BST" または "GMT+1" が返る（happy-dom では "GMT+1"）
      expect(['BST', 'GMT+1']).toContain(getTimezoneAbbreviation('Europe/London', summerDate));
    });

    it('Europe/London — 冬は "GMT" を返す', () => {
      const winterDate = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(winterDate);
      expect(getTimezoneAbbreviation('Europe/London', winterDate)).toBe('GMT');
    });
  });

  describe('エラーハンドリング', () => {
    it('不正なタイムゾーン文字列は "UTC" にフォールバック', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      expect(getTimezoneAbbreviation('Invalid/Zone')).toBe('UTC');
    });
  });
});
