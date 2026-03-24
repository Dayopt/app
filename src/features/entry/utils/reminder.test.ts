import { describe, expect, it } from 'vitest';

import { isReminderEnabled, reminderEnabledToMinutes } from '@/lib/reminder';

describe('reminder', () => {
  describe('isReminderEnabled', () => {
    it('returns true for 0 (ON)', () => {
      expect(isReminderEnabled(0)).toBe(true);
    });

    it('returns false for null (OFF)', () => {
      expect(isReminderEnabled(null)).toBe(false);
    });

    it('returns false for any other number', () => {
      expect(isReminderEnabled(5)).toBe(false);
      expect(isReminderEnabled(15)).toBe(false);
      expect(isReminderEnabled(60)).toBe(false);
    });
  });

  describe('reminderEnabledToMinutes', () => {
    it('returns 0 for true (ON)', () => {
      expect(reminderEnabledToMinutes(true)).toBe(0);
    });

    it('returns null for false (OFF)', () => {
      expect(reminderEnabledToMinutes(false)).toBeNull();
    });
  });

  describe('reminder notification time calculation', () => {
    it('at start time (reminder_minutes = 0)', () => {
      const eventStart = new Date('2025-01-15T10:00:00Z');
      const notifyAt = new Date(eventStart.getTime() - 0 * 60 * 1000);
      expect(notifyAt.toISOString()).toBe(eventStart.toISOString());
    });
  });
});
