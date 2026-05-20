import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMinutes,
  endOfDay,
  formatTime,
  formatTimeRange,
  generateDateRange,
  getDateKey,
  getDaysDifference,
  endOfMonth as getMonthEnd,
  startOfMonth as getMonthStart,
  endOfWeek as getWeekEnd,
  startOfWeek as getWeekStart,
  isSameDay,
  isToday,
  isWeekend,
  normalizeDate as normalizeEventDate,
  startOfDay,
} from '@/lib/date';

import { formatDate, getTodayIndex, isValidEvent } from './dateHelpers';

describe('dateHelpers', () => {
  describe('isToday', () => {
    it('今日の日付でtrueを返す', () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);
    });

    it('昨日の日付でfalseを返す', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });

    it('明日の日付でfalseを返す', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isToday(tomorrow)).toBe(false);
    });
  });

  describe('isWeekend', () => {
    it('土曜日でtrueを返す', () => {
      const saturday = new Date('2024-06-15'); // 土曜日
      expect(isWeekend(saturday)).toBe(true);
    });

    it('日曜日でtrueを返す', () => {
      const sunday = new Date('2024-06-16'); // 日曜日
      expect(isWeekend(sunday)).toBe(true);
    });

    it('平日でfalseを返す', () => {
      const monday = new Date('2024-06-17'); // 月曜日
      expect(isWeekend(monday)).toBe(false);
    });
  });

  describe('startOfDay', () => {
    it('日の開始時刻（00:00:00.000）を返す', () => {
      const date = new Date('2024-06-15T15:30:45.123');
      const result = startOfDay(date);

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
      expect(result.getDate()).toBe(15);
    });
  });

  describe('endOfDay', () => {
    it('日の終了時刻（23:59:59.999）を返す', () => {
      const date = new Date('2024-06-15T10:30:00');
      const result = endOfDay(date);

      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
      expect(result.getDate()).toBe(15);
    });
  });

  describe('formatDate', () => {
    it('short形式で日付をフォーマットする', () => {
      const date = new Date('2024-06-15'); // 土曜日
      expect(formatDate(date, 'short')).toBe('15日(土)');
    });

    it('long形式で日付をフォーマットする', () => {
      const date = new Date('2024-06-15');
      expect(formatDate(date, 'long')).toBe('6月15日(土)');
    });

    it('numeric形式で日付をフォーマットする', () => {
      const date = new Date('2024-06-15');
      expect(formatDate(date, 'numeric')).toBe('15');
    });
  });

  describe('formatTime', () => {
    it('24時間形式で時刻をフォーマットする', () => {
      const date = new Date('2024-06-15T09:05:00');
      expect(formatTime(date, '24h')).toBe('9:05');
    });

    it('12時間形式（AM）で時刻をフォーマットする', () => {
      const date = new Date('2024-06-15T09:05:00');
      expect(formatTime(date, '12h')).toBe('9:05 AM');
    });

    it('12時間形式（PM）で時刻をフォーマットする', () => {
      const date = new Date('2024-06-15T15:30:00');
      expect(formatTime(date, '12h')).toBe('3:30 PM');
    });

    it('深夜0時を12時間形式で正しくフォーマットする', () => {
      const date = new Date('2024-06-15T00:00:00');
      expect(formatTime(date, '12h')).toBe('12:00 AM');
    });
  });

  describe('formatTimeRange', () => {
    it('時間範囲を24時間形式でフォーマットする', () => {
      const start = new Date('2024-06-15T09:00:00');
      const end = new Date('2024-06-15T10:30:00');
      expect(formatTimeRange(start, end, '24h')).toBe('9:00 - 10:30');
    });

    it('時間範囲を12時間形式でフォーマットする', () => {
      const start = new Date('2024-06-15T14:00:00');
      const end = new Date('2024-06-15T15:30:00');
      expect(formatTimeRange(start, end, '12h')).toBe('2:00 PM - 3:30 PM');
    });
  });

  describe('isSameDay', () => {
    it('同じ日付でtrueを返す', () => {
      const date1 = new Date('2024-06-15T09:00:00');
      const date2 = new Date('2024-06-15T15:30:00');
      expect(isSameDay(date1, date2)).toBe(true);
    });

    it('異なる日付でfalseを返す', () => {
      const date1 = new Date('2024-06-15');
      const date2 = new Date('2024-06-16');
      expect(isSameDay(date1, date2)).toBe(false);
    });
  });

  describe('getDaysDifference', () => {
    it('日付の差を正しく計算する', () => {
      const date1 = new Date('2024-06-15');
      const date2 = new Date('2024-06-20');
      expect(getDaysDifference(date1, date2)).toBe(5);
    });

    it('逆順でも正しく計算する', () => {
      const date1 = new Date('2024-06-20');
      const date2 = new Date('2024-06-15');
      expect(getDaysDifference(date1, date2)).toBe(-5);
    });

    it('同じ日付で0を返す', () => {
      const date = new Date('2024-06-15');
      expect(getDaysDifference(date, date)).toBe(0);
    });
  });

  describe('generateDateRange', () => {
    it('日付範囲の配列を生成する', () => {
      const start = new Date('2024-06-15');
      const end = new Date('2024-06-18');
      const dates = generateDateRange(start, end);

      expect(dates).toHaveLength(4);
      expect(dates[0]!.getDate()).toBe(15);
      expect(dates[3]!.getDate()).toBe(18);
    });

    it('1日だけの範囲を生成する', () => {
      const date = new Date('2024-06-15');
      const dates = generateDateRange(date, date);

      expect(dates).toHaveLength(1);
      expect(dates[0]!.getDate()).toBe(15);
    });
  });

  describe('getWeekStart', () => {
    it('月曜日を週の開始日として返す', () => {
      const date = new Date('2024-06-15'); // 土曜日
      const weekStart = getWeekStart(date);

      expect(weekStart.getDay()).toBe(1); // 月曜日
      expect(weekStart.getDate()).toBe(10);
    });

    it('日曜日の場合、前週の月曜日を返す', () => {
      const sunday = new Date('2024-06-16'); // 日曜日
      const weekStart = getWeekStart(sunday);

      expect(weekStart.getDay()).toBe(1); // 月曜日
      expect(weekStart.getDate()).toBe(10);
    });
  });

  describe('getWeekEnd', () => {
    it('日曜日を週の終了日として返す', () => {
      const date = new Date('2024-06-15'); // 土曜日
      const weekEnd = getWeekEnd(date);

      expect(weekEnd.getDay()).toBe(0); // 日曜日
      expect(weekEnd.getDate()).toBe(16);
      expect(weekEnd.getHours()).toBe(23);
      expect(weekEnd.getMinutes()).toBe(59);
    });
  });

  describe('getMonthStart', () => {
    it('月の開始日（1日）を返す', () => {
      const date = new Date('2024-06-15');
      const monthStart = getMonthStart(date);

      expect(monthStart.getDate()).toBe(1);
      expect(monthStart.getMonth()).toBe(5); // 6月（0-indexed）
      expect(monthStart.getHours()).toBe(0);
    });
  });

  describe('getMonthEnd', () => {
    it('月の終了日を返す', () => {
      const date = new Date('2024-06-15');
      const monthEnd = getMonthEnd(date);

      expect(monthEnd.getDate()).toBe(30); // 6月は30日まで
      expect(monthEnd.getMonth()).toBe(5);
      expect(monthEnd.getHours()).toBe(23);
      expect(monthEnd.getMinutes()).toBe(59);
    });

    it('2月（うるう年）の終了日を正しく返す', () => {
      const date = new Date('2024-02-15'); // 2024年はうるう年
      const monthEnd = getMonthEnd(date);

      expect(monthEnd.getDate()).toBe(29);
    });
  });

  describe('addDays', () => {
    it('指定日数分日付を進める', () => {
      const date = new Date('2024-06-15');
      const result = addDays(date, 5);

      expect(result.getDate()).toBe(20);
      expect(result.getMonth()).toBe(5);
    });

    it('負の日数で日付を戻す', () => {
      const date = new Date('2024-06-15');
      const result = addDays(date, -5);

      expect(result.getDate()).toBe(10);
    });

    it('月をまたぐ場合も正しく計算する', () => {
      const date = new Date('2024-06-28');
      const result = addDays(date, 5);

      expect(result.getDate()).toBe(3);
      expect(result.getMonth()).toBe(6); // 7月
    });
  });

  describe('addMinutes', () => {
    it('指定分数分時刻を進める', () => {
      const date = new Date('2024-06-15T10:00:00');
      const result = addMinutes(date, 30);

      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(30);
    });

    it('時間をまたぐ場合も正しく計算する', () => {
      const date = new Date('2024-06-15T10:45:00');
      const result = addMinutes(date, 30);

      expect(result.getHours()).toBe(11);
      expect(result.getMinutes()).toBe(15);
    });
  });

  describe('getDateKey', () => {
    it('yyyy-MM-dd形式のキーを生成する', () => {
      const date = new Date('2024-06-05');
      expect(getDateKey(date)).toBe('2024-06-05');
    });

    it('1桁の月と日を0埋めする', () => {
      const date = new Date('2024-01-09');
      expect(getDateKey(date)).toBe('2024-01-09');
    });
  });

  describe('isValidEvent', () => {
    it('有効なイベントでtrueを返す', () => {
      const event = { startDate: new Date('2024-06-15') };
      expect(isValidEvent(event)).toBe(true);
    });

    it('startDateがない場合falseを返す', () => {
      const event = {};
      expect(isValidEvent(event)).toBe(false);
    });

    it('無効な日付文字列でfalseを返す', () => {
      const event = { startDate: 'invalid-date' };
      expect(isValidEvent(event)).toBe(false);
    });

    it('文字列形式の有効な日付でtrueを返す', () => {
      const event = { startDate: '2024-06-15' };
      expect(isValidEvent(event)).toBe(true);
    });
  });

  describe('normalizeEventDate', () => {
    it('Date型をそのまま返す', () => {
      const date = new Date('2024-06-15');
      const result = normalizeEventDate(date);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getDate()).toBe(15);
    });

    it('文字列をDateに変換する', () => {
      const result = normalizeEventDate('2024-06-15');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getDate()).toBe(15);
    });

    it('無効な文字列でnullを返す', () => {
      const result = normalizeEventDate('invalid-date');
      expect(result).toBeNull();
    });

    it('空の値でnullを返す', () => {
      const result = normalizeEventDate('' as unknown as Date);
      expect(result).toBeNull();
    });
  });

  describe('getTodayIndex', () => {
    it('今日の日付のインデックスを返す', () => {
      const today = new Date();
      const dates = [addDays(today, -2), addDays(today, -1), today, addDays(today, 1)];
      const index = getTodayIndex(dates);
      expect(index).toBe(2);
    });

    it('今日が含まれない場合-1を返す', () => {
      const today = new Date();
      const dates = [addDays(today, 1), addDays(today, 2)];
      const index = getTodayIndex(dates);
      expect(index).toBe(-1);
    });
  });
});
