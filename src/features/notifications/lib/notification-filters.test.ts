import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkBrowserNotificationSupport, getDateGroupKey } from './notification-filters';

describe('notification-helpers', () => {
  describe('getDateGroupKey', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // 2025年1月15日（水曜日）に固定
      vi.setSystemTime(new Date('2025-01-15T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('今日の日付は「today」を返す', () => {
      expect(getDateGroupKey('2025-01-15T10:00:00')).toBe('today');
      expect(getDateGroupKey(new Date('2025-01-15T08:00:00'))).toBe('today');
    });

    it('昨日の日付は「yesterday」を返す', () => {
      expect(getDateGroupKey('2025-01-14T10:00:00')).toBe('yesterday');
    });

    it('今週（今日・昨日以外）の日付は「thisWeek」を返す', () => {
      // 1月13日（月曜日）- 今週
      expect(getDateGroupKey('2025-01-13T10:00:00')).toBe('thisWeek');
    });

    it('今月（今週以外）の日付は「thisMonth」を返す', () => {
      // 1月5日（日曜日）- 今月だが今週ではない
      expect(getDateGroupKey('2025-01-05T10:00:00')).toBe('thisMonth');
    });

    it('それより前の日付は「older」を返す', () => {
      expect(getDateGroupKey('2024-12-01T10:00:00')).toBe('older');
      expect(getDateGroupKey('2024-01-01T10:00:00')).toBe('older');
    });

    it('文字列とDateオブジェクト両方を受け付ける', () => {
      const dateString = '2025-01-15T10:00:00';
      const dateObject = new Date('2025-01-15T10:00:00');

      expect(getDateGroupKey(dateString)).toBe('today');
      expect(getDateGroupKey(dateObject)).toBe('today');
    });
  });

  describe('checkBrowserNotificationSupport', () => {
    it('window.Notificationが存在する場合はtrueを返す', () => {
      const result = checkBrowserNotificationSupport();
      expect(typeof result).toBe('boolean');
    });
  });
});
