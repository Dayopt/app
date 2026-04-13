import { describe, expect, it } from 'vitest';

import { normalizeDateTimeConsistency } from '../entry-normalization';

describe('normalizeDateTimeConsistency — エッジケース', () => {
  describe('真夜中境界（Date boundary）', () => {
    it('start_time が 23:59:59.999Z の場合、翌 00:00:00Z の end_time を同時刻にキャップ', () => {
      const data = {
        start_time: '2025-03-15T23:59:59.999Z',
        end_time: '2025-03-16T00:00:00.000Z',
      };
      const result = normalizeDateTimeConsistency(data);
      expect(data.end_time).toBe('2025-03-15T23:59:59.999Z');
      expect(result).toBe('capped');
    });

    it('23:00 → 翌日 00:00 の真夜中またぎは capped', () => {
      const data = {
        start_time: '2025-03-15T23:00:00.000Z',
        end_time: '2025-03-16T00:00:00.000Z',
      };
      const result = normalizeDateTimeConsistency(data);
      expect(data.end_time).toBe('2025-03-15T23:59:59.999Z');
      expect(result).toBe('capped');
    });

    it('複数日にまたがる場合（2日後）も start_time の日の終わりにキャップ', () => {
      const data = {
        start_time: '2025-03-15T09:00:00.000Z',
        end_time: '2025-03-17T10:00:00.000Z',
      };
      const result = normalizeDateTimeConsistency(data);
      expect(data.end_time).toBe('2025-03-15T23:59:59.999Z');
      expect(result).toBe('capped');
    });
  });

  describe('0分ブロック', () => {
    it('start === end の場合は変更なし', () => {
      const data = {
        start_time: '2025-03-15T09:00:00.000Z',
        end_time: '2025-03-15T09:00:00.000Z',
      };
      const result = normalizeDateTimeConsistency(data);
      expect(data.start_time).toBe('2025-03-15T09:00:00.000Z');
      expect(data.end_time).toBe('2025-03-15T09:00:00.000Z');
      expect(result).toBeUndefined();
    });

    it('end_time が start_time と同日で 1ms 後の場合は変更なし', () => {
      const data = {
        start_time: '2025-03-15T09:00:00.000Z',
        end_time: '2025-03-15T09:00:00.001Z',
      };
      const result = normalizeDateTimeConsistency(data);
      expect(data.end_time).toBe('2025-03-15T09:00:00.001Z');
      expect(result).toBeUndefined();
    });
  });

  describe('日付ズレ補正（same-day enforcement）', () => {
    it('end_time が過去日で時刻も前 → start_time と同値に固定', () => {
      const data = {
        start_time: '2025-03-15T10:00:00.000Z',
        end_time: '2025-03-14T09:00:00.000Z',
      };
      normalizeDateTimeConsistency(data);
      expect(data.end_time).toBe('2025-03-15T10:00:00.000Z');
    });

    it('end_time が過去日だが時刻は start_time より後 → 日付を揃えて end > start なら OK', () => {
      const data = {
        start_time: '2025-03-15T10:00:00.000Z',
        end_time: '2025-03-14T23:00:00.000Z',
      };
      normalizeDateTimeConsistency(data);
      // 日付が 3/15 に揃えられ、時刻 23:00 は start 10:00 より後 → そのまま
      expect(data.end_time).toBe('2025-03-15T23:00:00.000Z');
    });

    it('end_time が過去日で、日付揃え後も end < start → start_time と同値に固定', () => {
      const data = {
        start_time: '2025-03-15T22:00:00.000Z',
        end_time: '2025-03-14T10:00:00.000Z',
      };
      normalizeDateTimeConsistency(data);
      // 日付揃え後: 2025-03-15T10:00:00.000Z < start → start に固定
      expect(data.end_time).toBe('2025-03-15T22:00:00.000Z');
    });
  });

  describe('戻り値の契約', () => {
    it('capped の場合は "capped" を返す', () => {
      const data = {
        start_time: '2025-03-15T23:30:00.000Z',
        end_time: '2025-03-16T00:30:00.000Z',
      };
      expect(normalizeDateTimeConsistency(data)).toBe('capped');
    });

    it('正規化不要の場合は undefined を返す', () => {
      const data = {
        start_time: '2025-03-15T09:00:00.000Z',
        end_time: '2025-03-15T10:00:00.000Z',
      };
      expect(normalizeDateTimeConsistency(data)).toBeUndefined();
    });

    it('end_time を start_time に揃えた場合は undefined を返す（capped ではない）', () => {
      const data = {
        start_time: '2025-03-15T10:00:00.000Z',
        end_time: '2025-03-14T08:00:00.000Z',
      };
      expect(normalizeDateTimeConsistency(data)).toBeUndefined();
    });
  });
});
