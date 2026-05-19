/**
 * Entry Status Utilities Unit Tests
 *
 * エントリの時間位置ベースの状態判定ユーティリティのテスト
 * - getEntryState: 時間位置から状態を判定 (upcoming/active/past)
 * - isEntryPast: エントリが過去かどうかを判定
 */

import { describe, expect, it } from 'vitest';

import { getEntryState, isEntryPast } from '../entry-status';

describe('Entry Status Utilities', () => {
  // Fixed reference time for deterministic tests
  const referenceTime = new Date('2026-03-12T12:00:00Z');

  describe('getEntryState', () => {
    describe('null start/end times', () => {
      it('should return upcoming when start_time is null', () => {
        const entry = { start_time: null, end_time: '2024-01-15T13:00:00Z' };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('upcoming');
      });

      it('should return upcoming when end_time is null', () => {
        const entry = { start_time: '2024-01-15T11:00:00Z', end_time: null };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('upcoming');
      });

      it('should return upcoming when both start_time and end_time are null', () => {
        const entry = { start_time: null, end_time: null };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('upcoming');
      });
    });

    describe('future entry (start > now)', () => {
      it('should return upcoming for entry completely in future', () => {
        const entry = {
          start_time: '2026-03-12T13:00:00Z',
          end_time: '2026-03-12T14:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('upcoming');
      });

      it('should return upcoming for entry starting far in future', () => {
        const entry = {
          start_time: '2026-03-20T09:00:00Z',
          end_time: '2026-03-20T10:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('upcoming');
      });
    });

    describe('active entry (start <= now < end)', () => {
      it('should return active when now is between start and end', () => {
        const entry = {
          start_time: '2026-03-12T11:00:00Z',
          end_time: '2026-03-12T13:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('active');
      });

      it('should return active when now equals start_time', () => {
        const entry = {
          start_time: '2026-03-12T12:00:00Z',
          end_time: '2026-03-12T13:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('active');
      });

      it('should return active when now is just before end_time', () => {
        const entry = {
          start_time: '2026-03-12T11:00:00Z',
          end_time: '2026-03-12T12:00:01Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('active');
      });
    });

    describe('past entry (end <= now)', () => {
      it('should return past when end_time is before now', () => {
        const entry = {
          start_time: '2026-03-12T10:00:00Z',
          end_time: '2026-03-12T11:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('past');
      });

      it('should return past when now equals end_time', () => {
        const entry = {
          start_time: '2026-03-12T11:00:00Z',
          end_time: '2026-03-12T12:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('past');
      });

      it('should return past for entry far in past', () => {
        const entry = {
          start_time: '2026-03-10T08:00:00Z',
          end_time: '2026-03-10T09:00:00Z',
        };
        const result = getEntryState(entry, referenceTime);
        expect(result).toBe('past');
      });
    });

    describe('default now parameter', () => {
      it('should use current Date when now is not provided', () => {
        const entry = {
          start_time: '2099-12-31T00:00:00Z',
          end_time: '2099-12-31T01:00:00Z',
        };
        // This entry is definitely in future, so should be upcoming
        const result = getEntryState(entry);
        expect(result).toBe('upcoming');
      });
    });
  });

  describe('isEntryPast', () => {
    it('should return true when entry is in past', () => {
      const entry = {
        start_time: '2024-01-15T10:00:00Z',
        end_time: '2024-01-15T11:00:00Z',
      };
      expect(isEntryPast(entry, referenceTime)).toBe(true);
    });

    it('should return false when entry is upcoming', () => {
      const entry = {
        start_time: '2026-03-12T13:00:00Z',
        end_time: '2026-03-12T14:00:00Z',
      };
      expect(isEntryPast(entry, referenceTime)).toBe(false);
    });

    it('should return false when entry is active', () => {
      const entry = {
        start_time: '2026-03-12T11:00:00Z',
        end_time: '2026-03-12T13:00:00Z',
      };
      expect(isEntryPast(entry, referenceTime)).toBe(false);
    });

    it('should return false when entry has null times', () => {
      const entry = { start_time: null, end_time: null };
      expect(isEntryPast(entry, referenceTime)).toBe(false);
    });

    it('should return true when now equals end_time (boundary)', () => {
      const entry = {
        start_time: '2026-03-12T11:00:00Z',
        end_time: '2026-03-12T12:00:00Z',
      };
      expect(isEntryPast(entry, referenceTime)).toBe(true);
    });
  });
});
