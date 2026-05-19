/**
 * Date Core Utilities Unit Tests
 *
 * 日付操作コアユーティリティのテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  generateDateRange,
  getDateKey,
  getDaysDifference,
  getMonthDates,
  getMonthKey,
  getTimeDifference,
  getWeekDates,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  isTomorrow,
  isValidDate,
  isWeekend,
  isWithinRange,
  isYesterday,
  normalizeDate,
  parseDateString,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from '../core';

describe('Date Core Utilities', () => {
  describe('Day Boundaries', () => {
    describe('startOfDay', () => {
      it('should set time to 00:00:00.000', () => {
        const date = new Date('2024-01-15T14:30:45.123');
        const result = startOfDay(date);

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
      });

      it('should preserve the date', () => {
        const date = new Date('2024-01-15T14:30:45.123');
        const result = startOfDay(date);

        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(0); // January
        expect(result.getDate()).toBe(15);
      });

      it('should not modify the original date', () => {
        const date = new Date('2024-01-15T14:30:45.123');
        const originalTime = date.getTime();
        startOfDay(date);

        expect(date.getTime()).toBe(originalTime);
      });
    });

    describe('endOfDay', () => {
      it('should set time to 23:59:59.999', () => {
        const date = new Date('2024-01-15T14:30:45.123');
        const result = endOfDay(date);

        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(59);
        expect(result.getSeconds()).toBe(59);
        expect(result.getMilliseconds()).toBe(999);
      });

      it('should preserve the date', () => {
        const date = new Date('2024-01-15T14:30:45.123');
        const result = endOfDay(date);

        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(15);
      });
    });
  });

  describe('Week Boundaries', () => {
    describe('startOfWeek', () => {
      it('should return Monday by default', () => {
        // Wednesday, January 17, 2024
        const date = new Date('2024-01-17T10:00:00');
        const result = startOfWeek(date);

        expect(result.getDay()).toBe(1); // Monday
        expect(result.getDate()).toBe(15);
      });

      it('should return Sunday when weekStartsOn is 0', () => {
        const date = new Date('2024-01-17T10:00:00');
        const result = startOfWeek(date, { weekStartsOn: 0 });

        expect(result.getDay()).toBe(0); // Sunday
        expect(result.getDate()).toBe(14);
      });

      it('should set time to start of day', () => {
        const date = new Date('2024-01-17T14:30:00');
        const result = startOfWeek(date);

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
      });

      it('should return same day if already start of week', () => {
        // Monday
        const date = new Date('2024-01-15T10:00:00');
        const result = startOfWeek(date);

        expect(result.getDate()).toBe(15);
      });
    });

    describe('endOfWeek', () => {
      it('should return Sunday by default', () => {
        const date = new Date('2024-01-17T10:00:00');
        const result = endOfWeek(date);

        expect(result.getDay()).toBe(0); // Sunday
        expect(result.getDate()).toBe(21);
      });

      it('should set time to end of day', () => {
        const date = new Date('2024-01-17T10:00:00');
        const result = endOfWeek(date);

        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(59);
        expect(result.getSeconds()).toBe(59);
      });
    });
  });

  describe('Month Boundaries', () => {
    describe('startOfMonth', () => {
      it('should return first day of month', () => {
        const date = new Date('2024-01-15T10:00:00');
        const result = startOfMonth(date);

        expect(result.getDate()).toBe(1);
        expect(result.getMonth()).toBe(0);
      });

      it('should set time to start of day', () => {
        const date = new Date('2024-01-15T14:30:00');
        const result = startOfMonth(date);

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
      });
    });

    describe('endOfMonth', () => {
      it('should return last day of month', () => {
        const date = new Date('2024-01-15T10:00:00');
        const result = endOfMonth(date);

        expect(result.getDate()).toBe(31);
        expect(result.getMonth()).toBe(0);
      });

      it('should handle February in leap year', () => {
        const date = new Date('2024-02-15T10:00:00');
        const result = endOfMonth(date);

        expect(result.getDate()).toBe(29);
      });

      it('should handle February in non-leap year', () => {
        const date = new Date('2023-02-15T10:00:00');
        const result = endOfMonth(date);

        expect(result.getDate()).toBe(28);
      });

      it('should set time to end of day', () => {
        const date = new Date('2024-01-15T10:00:00');
        const result = endOfMonth(date);

        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(59);
        expect(result.getSeconds()).toBe(59);
      });
    });
  });

  describe('Date Addition', () => {
    describe('addDays', () => {
      it('should add positive days', () => {
        const date = new Date('2024-01-15');
        const result = addDays(date, 5);

        expect(result.getDate()).toBe(20);
      });

      it('should handle month rollover', () => {
        const date = new Date('2024-01-30');
        const result = addDays(date, 5);

        expect(result.getMonth()).toBe(1); // February
        expect(result.getDate()).toBe(4);
      });

      it('should handle negative days', () => {
        const date = new Date('2024-01-15');
        const result = addDays(date, -10);

        expect(result.getDate()).toBe(5);
      });
    });

    describe('subDays', () => {
      it('should subtract days', () => {
        const date = new Date('2024-01-15');
        const result = subDays(date, 5);

        expect(result.getDate()).toBe(10);
      });
    });

    describe('addWeeks', () => {
      it('should add weeks', () => {
        const date = new Date('2024-01-15');
        const result = addWeeks(date, 2);

        expect(result.getDate()).toBe(29);
      });
    });

    describe('addMonths', () => {
      it('should add months', () => {
        const date = new Date('2024-01-15');
        const result = addMonths(date, 2);

        expect(result.getMonth()).toBe(2); // March
      });

      it('should handle year rollover', () => {
        const date = new Date('2024-11-15');
        const result = addMonths(date, 3);

        expect(result.getFullYear()).toBe(2025);
        expect(result.getMonth()).toBe(1); // February
      });
    });

    describe('addMinutes', () => {
      it('should add minutes', () => {
        const date = new Date('2024-01-15T10:30:00');
        const result = addMinutes(date, 45);

        expect(result.getHours()).toBe(11);
        expect(result.getMinutes()).toBe(15);
      });
    });

    describe('addHours', () => {
      it('should add hours', () => {
        const date = new Date('2024-01-15T10:00:00');
        const result = addHours(date, 5);

        expect(result.getHours()).toBe(15);
      });

      it('should handle day rollover', () => {
        const date = new Date('2024-01-15T22:00:00');
        const result = addHours(date, 5);

        expect(result.getDate()).toBe(16);
        expect(result.getHours()).toBe(3);
      });
    });
  });

  describe('Comparison Functions', () => {
    describe('isSameDay', () => {
      it('should return true for same day', () => {
        const date1 = new Date('2024-01-15T10:00:00');
        const date2 = new Date('2024-01-15T20:00:00');

        expect(isSameDay(date1, date2)).toBe(true);
      });

      it('should return false for different days', () => {
        const date1 = new Date('2024-01-15T10:00:00');
        const date2 = new Date('2024-01-16T10:00:00');

        expect(isSameDay(date1, date2)).toBe(false);
      });
    });

    describe('isToday', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-15T12:00:00'));
      });

      it('should return true for today', () => {
        const today = new Date('2024-01-15T08:00:00');
        expect(isToday(today)).toBe(true);
      });

      it('should return false for other days', () => {
        const tomorrow = new Date('2024-01-16T08:00:00');
        expect(isToday(tomorrow)).toBe(false);
      });
    });

    describe('isTomorrow', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-15T12:00:00'));
      });

      it('should return true for tomorrow', () => {
        const tomorrow = new Date('2024-01-16T08:00:00');
        expect(isTomorrow(tomorrow)).toBe(true);
      });

      it('should return false for today', () => {
        const today = new Date('2024-01-15T08:00:00');
        expect(isTomorrow(today)).toBe(false);
      });
    });

    describe('isYesterday', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-15T12:00:00'));
      });

      it('should return true for yesterday', () => {
        const yesterday = new Date('2024-01-14T08:00:00');
        expect(isYesterday(yesterday)).toBe(true);
      });

      it('should return false for today', () => {
        const today = new Date('2024-01-15T08:00:00');
        expect(isYesterday(today)).toBe(false);
      });
    });

    describe('isWeekend', () => {
      it('should return true for Saturday', () => {
        const saturday = new Date('2024-01-13'); // Saturday
        expect(isWeekend(saturday)).toBe(true);
      });

      it('should return true for Sunday', () => {
        const sunday = new Date('2024-01-14'); // Sunday
        expect(isWeekend(sunday)).toBe(true);
      });

      it('should return false for weekday', () => {
        const monday = new Date('2024-01-15'); // Monday
        expect(isWeekend(monday)).toBe(false);
      });
    });

    describe('isBefore', () => {
      it('should return true when date1 is before date2', () => {
        const date1 = new Date('2024-01-15');
        const date2 = new Date('2024-01-20');

        expect(isBefore(date1, date2)).toBe(true);
      });

      it('should return false when date1 is after date2', () => {
        const date1 = new Date('2024-01-20');
        const date2 = new Date('2024-01-15');

        expect(isBefore(date1, date2)).toBe(false);
      });
    });

    describe('isAfter', () => {
      it('should return true when date1 is after date2', () => {
        const date1 = new Date('2024-01-20');
        const date2 = new Date('2024-01-15');

        expect(isAfter(date1, date2)).toBe(true);
      });
    });

    describe('isWithinRange', () => {
      it('should return true when date is within range', () => {
        const date = new Date('2024-01-15');
        const start = new Date('2024-01-10');
        const end = new Date('2024-01-20');

        expect(isWithinRange(date, start, end)).toBe(true);
      });

      it('should return true for boundary dates', () => {
        const start = new Date('2024-01-10');
        const end = new Date('2024-01-20');

        expect(isWithinRange(start, start, end)).toBe(true);
        expect(isWithinRange(end, start, end)).toBe(true);
      });

      it('should return false when date is outside range', () => {
        const date = new Date('2024-01-25');
        const start = new Date('2024-01-10');
        const end = new Date('2024-01-20');

        expect(isWithinRange(date, start, end)).toBe(false);
      });
    });
  });

  describe('Difference Calculations', () => {
    describe('getDaysDifference', () => {
      it('should calculate positive difference', () => {
        const date1 = new Date('2024-01-10');
        const date2 = new Date('2024-01-15');

        expect(getDaysDifference(date1, date2)).toBe(5);
      });

      it('should calculate negative difference', () => {
        const date1 = new Date('2024-01-15');
        const date2 = new Date('2024-01-10');

        expect(getDaysDifference(date1, date2)).toBe(-5);
      });

      it('should return 0 for same day', () => {
        const date1 = new Date('2024-01-15T10:00:00');
        const date2 = new Date('2024-01-15T20:00:00');

        expect(getDaysDifference(date1, date2)).toBe(0);
      });
    });

    describe('getTimeDifference', () => {
      it('should calculate millisecond difference', () => {
        const date1 = new Date('2024-01-15T10:00:00');
        const date2 = new Date('2024-01-15T11:00:00');

        expect(getTimeDifference(date1, date2)).toBe(60 * 60 * 1000);
      });
    });
  });

  describe('Array Generation', () => {
    describe('generateDateRange', () => {
      it('should generate inclusive date range', () => {
        const start = new Date('2024-01-15');
        const end = new Date('2024-01-18');

        const result = generateDateRange(start, end);

        expect(result).toHaveLength(4);
        expect(result[0]?.getDate()).toBe(15);
        expect(result[3]?.getDate()).toBe(18);
      });

      it('should return single date for same start and end', () => {
        const date = new Date('2024-01-15');

        const result = generateDateRange(date, date);

        expect(result).toHaveLength(1);
      });
    });

    describe('getWeekDates', () => {
      it('should return 7 days', () => {
        const date = new Date('2024-01-17');

        const result = getWeekDates(date);

        expect(result).toHaveLength(7);
      });

      it('should start from Monday', () => {
        const date = new Date('2024-01-17');

        const result = getWeekDates(date);

        expect(result[0]?.getDay()).toBe(1); // Monday
      });
    });

    describe('getMonthDates', () => {
      it('should return all days in month', () => {
        const date = new Date('2024-01-15');

        const result = getMonthDates(date);

        expect(result).toHaveLength(31);
      });

      it('should handle February in leap year', () => {
        const date = new Date('2024-02-15');

        const result = getMonthDates(date);

        expect(result).toHaveLength(29);
      });
    });
  });

  describe('Key Generation', () => {
    describe('getDateKey', () => {
      it('should generate YYYY-MM-DD format', () => {
        const date = new Date('2024-01-15');

        expect(getDateKey(date)).toBe('2024-01-15');
      });

      it('should pad single digit month and day', () => {
        const date = new Date('2024-01-05');

        expect(getDateKey(date)).toBe('2024-01-05');
      });
    });

    describe('getMonthKey', () => {
      it('should generate YYYY-MM format', () => {
        const date = new Date('2024-01-15');

        expect(getMonthKey(date)).toBe('2024-01');
      });
    });
  });

  describe('Parsing', () => {
    describe('parseDateString', () => {
      it('should parse YYYY-MM-DD format', () => {
        const result = parseDateString('2024-01-15');

        expect(result.getFullYear()).toBe(2024);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(15);
      });

      it('should create date in local timezone', () => {
        const result = parseDateString('2024-01-15');

        // Should be midnight local time, not UTC
        expect(result.getHours()).toBe(0);
      });

      it('should throw for invalid format', () => {
        expect(() => parseDateString('2024/01/15')).toThrow('Invalid date format');
        expect(() => parseDateString('01-15-2024')).toThrow('Invalid date format');
        expect(() => parseDateString('invalid')).toThrow('Invalid date format');
      });
    });

    describe('normalizeDate', () => {
      it('should return Date object as is', () => {
        const date = new Date('2024-01-15');
        const result = normalizeDate(date);

        expect(result).toEqual(date);
      });

      it('should parse string to Date', () => {
        const result = normalizeDate('2024-01-15T10:00:00');

        expect(result).toBeInstanceOf(Date);
        expect(result?.getFullYear()).toBe(2024);
      });

      it('should return null for null input', () => {
        expect(normalizeDate(null)).toBeNull();
      });

      it('should return null for undefined input', () => {
        expect(normalizeDate(undefined)).toBeNull();
      });

      it('should return null for invalid date string', () => {
        expect(normalizeDate('invalid')).toBeNull();
      });
    });

    describe('isValidDate', () => {
      it('should return true for valid date', () => {
        expect(isValidDate(new Date('2024-01-15'))).toBe(true);
      });

      it('should return false for invalid date', () => {
        expect(isValidDate(new Date('invalid'))).toBe(false);
      });
    });
  });
});
