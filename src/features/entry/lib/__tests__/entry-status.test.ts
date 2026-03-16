/**
 * Entry Status Utilities Unit Tests
 *
 * エントリの時間位置ベースの状態判定ユーティリティのテスト
 * - getEntryState: 時間位置から状態を判定 (upcoming/active/past)
 * - isEntryPast: エントリが過去かどうかを判定
 * - isTimePast: 指定時刻が過去かどうかを判定
 * - computeOriginTransition: ドラッグ移動時の origin 自動遷移を計算
 */

import { describe, expect, it } from 'vitest';

import { computeOriginTransition, getEntryState, isEntryPast, isTimePast } from '../entry-status';

describe('Entry Status Utilities', () => {
  // Fixed reference time for deterministic tests
  // Use a date from system time range so computeOriginTransition tests work
  // (since it uses current system time, not a passed parameter)
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

  describe('isTimePast', () => {
    it('should return true when time is before now', () => {
      const time = '2026-03-12T11:00:00Z';
      expect(isTimePast(time, referenceTime)).toBe(true);
    });

    it('should return false when time is after now', () => {
      const time = '2026-03-12T13:00:00Z';
      expect(isTimePast(time, referenceTime)).toBe(false);
    });

    it('should return false when time equals now', () => {
      const time = '2026-03-12T12:00:00Z';
      expect(isTimePast(time, referenceTime)).toBe(false);
    });

    it('should accept Date object as input', () => {
      const time = new Date('2026-03-12T11:00:00Z');
      expect(isTimePast(time, referenceTime)).toBe(true);
    });

    it('should accept ISO string as input', () => {
      const time = '2026-03-12T11:00:00Z';
      expect(isTimePast(time, referenceTime)).toBe(true);
    });

    it('should use current Date when now is not provided', () => {
      // Far future time should never be past
      const time = '2099-12-31T00:00:00Z';
      expect(isTimePast(time)).toBe(false);
    });

    it('should handle millisecond precision', () => {
      const time = '2026-03-12T12:00:00.999Z';
      expect(isTimePast(time, referenceTime)).toBe(false);
    });
  });

  describe('computeOriginTransition', () => {
    describe('planned origin - stays planned regardless of time', () => {
      it('should return planned origin when moving planned entry to future', () => {
        const newStartTime = new Date('2026-03-20T09:00:00Z');
        const newEndTime = new Date('2026-03-20T10:00:00Z');

        const result = computeOriginTransition('planned', newStartTime, newEndTime);

        expect(result.origin).toBe('planned');
        expect(result.clearFields).toBeNull();
      });

      it('should return planned origin when moving planned entry to past', () => {
        const newStartTime = new Date('2026-03-10T09:00:00Z');
        const newEndTime = new Date('2026-03-10T10:00:00Z');

        const result = computeOriginTransition('planned', newStartTime, newEndTime);

        expect(result.origin).toBe('planned');
        expect(result.clearFields).toBeNull();
      });

      it('should return planned origin when entry becomes active', () => {
        const newStartTime = new Date('2026-03-12T11:00:00Z');
        const newEndTime = new Date('2026-03-12T13:00:00Z');

        const result = computeOriginTransition('planned', newStartTime, newEndTime);

        expect(result.origin).toBe('planned');
        expect(result.clearFields).toBeNull();
      });
    });

    describe('unplanned origin - transitions to planned when moved to future', () => {
      it('should transition to planned and clear fields when moved to future', () => {
        const newStartTime = new Date('2026-03-20T09:00:00Z');
        const newEndTime = new Date('2026-03-20T10:00:00Z');

        const result = computeOriginTransition('unplanned', newStartTime, newEndTime);

        expect(result.origin).toBe('planned');
        expect(result.clearFields).toEqual({
          actual_start_time: null,
          actual_end_time: null,
          fulfillment_score: null,
        });
      });

      it('should transition to planned and clear fields when made active', () => {
        const now = new Date('2026-03-12T12:00:00Z');
        const newStartTime = new Date('2026-03-12T11:00:00Z');
        const newEndTime = new Date('2026-03-12T13:00:00Z');

        const result = computeOriginTransition('unplanned', newStartTime, newEndTime, now);

        expect(result.origin).toBe('planned');
        expect(result.clearFields).toEqual({
          actual_start_time: null,
          actual_end_time: null,
          fulfillment_score: null,
        });
      });

      it('should stay unplanned and not clear fields when moved to past', () => {
        const newStartTime = new Date('2026-03-10T09:00:00Z');
        const newEndTime = new Date('2026-03-10T10:00:00Z');

        const result = computeOriginTransition('unplanned', newStartTime, newEndTime);

        expect(result.origin).toBe('unplanned');
        expect(result.clearFields).toBeNull();
      });

      it('should transition to planned when moved to future (upcoming)', () => {
        const newStartTime = new Date('2099-03-15T13:00:00Z');
        const newEndTime = new Date('2099-03-15T14:00:00Z');

        const result = computeOriginTransition('unplanned', newStartTime, newEndTime);

        // future (upcoming) should transition to planned
        expect(result.origin).toBe('planned');
      });
    });

    describe('clear fields structure', () => {
      it('should include all three record fields in clearFields', () => {
        const newStartTime = new Date('2026-03-20T09:00:00Z');
        const newEndTime = new Date('2026-03-20T10:00:00Z');

        const result = computeOriginTransition('unplanned', newStartTime, newEndTime);

        expect(result.clearFields).toHaveProperty('actual_start_time', null);
        expect(result.clearFields).toHaveProperty('actual_end_time', null);
        expect(result.clearFields).toHaveProperty('fulfillment_score', null);
        expect(Object.keys(result.clearFields || {})).toHaveLength(3);
      });

      it('should return null clearFields for planned entries', () => {
        const newStartTime = new Date('2026-03-20T09:00:00Z');
        const newEndTime = new Date('2026-03-20T10:00:00Z');

        const result = computeOriginTransition('planned', newStartTime, newEndTime);

        expect(result.clearFields).toBeNull();
      });

      it('should return null clearFields for unplanned entries moved to past', () => {
        const newStartTime = new Date('2026-03-10T09:00:00Z');
        const newEndTime = new Date('2026-03-10T10:00:00Z');

        const result = computeOriginTransition('unplanned', newStartTime, newEndTime);

        expect(result.clearFields).toBeNull();
      });
    });

    describe('time comparisons within computeOriginTransition', () => {
      it('should use internal getEntryState to determine new state', () => {
        // This test verifies that computeOriginTransition correctly uses getEntryState
        // by passing ISO strings to it via toISOString()

        const future = new Date('2026-03-20T09:00:00Z');
        const futureEnd = new Date('2026-03-20T10:00:00Z');

        const result = computeOriginTransition('unplanned', future, futureEnd);

        // Should transition because it's future (upcoming)
        expect(result.origin).toBe('planned');
      });

      it('should handle times at state boundaries', () => {
        // At the exact moment an entry transitions from upcoming to active
        // Time: 2026-03-12T12:00:00Z is exactly the start
        const now = new Date('2026-03-12T12:00:00Z');
        const atStart = new Date('2026-03-12T12:00:00Z');
        const atEnd = new Date('2026-03-12T13:00:00Z');

        const result = computeOriginTransition('unplanned', atStart, atEnd, now);

        // When now=start, entry is active, should transition
        expect(result.origin).toBe('planned');
      });
    });
  });

  describe('Integration: state transitions with origin', () => {
    it('should handle full workflow: unplanned record becoming planned', () => {
      // Step 1: Create unplanned entry for current time (active state)
      const unplannedEntry = {
        start_time: '2026-03-12T11:00:00Z',
        end_time: '2026-03-12T13:00:00Z',
      };

      expect(getEntryState(unplannedEntry, referenceTime)).toBe('active');
      expect(isEntryPast(unplannedEntry, referenceTime)).toBe(false);

      // Step 2: User drags it to future time
      const futureStart = new Date('2026-03-20T09:00:00Z');
      const futureEnd = new Date('2026-03-20T10:00:00Z');

      const transition = computeOriginTransition('unplanned', futureStart, futureEnd);

      expect(transition.origin).toBe('planned');
      expect(transition.clearFields).not.toBeNull();

      // Step 3: Verify new state
      const plannedEntry = {
        start_time: futureStart.toISOString(),
        end_time: futureEnd.toISOString(),
      };

      expect(getEntryState(plannedEntry, referenceTime)).toBe('upcoming');
    });

    it('should prevent drag to past (unplanned record protection)', () => {
      // Unplanned entry moved to past should NOT transition to planned
      const pastStart = new Date('2026-03-10T09:00:00Z');
      const pastEnd = new Date('2026-03-10T10:00:00Z');

      const result = computeOriginTransition('unplanned', pastStart, pastEnd);

      expect(result.origin).toBe('unplanned');
      expect(result.clearFields).toBeNull();
    });
  });
});
