import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../types/calendar-event';
import { buildTimeblockDayDiffPlans, buildTimeblockDayDiffRecords } from './build-day-diff-inputs';

function entry(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date('2026-06-18T09:00:00.000Z');
  const end = new Date('2026-06-18T10:00:00.000Z');

  return {
    id: 'plan-1',
    title: 'Focus',
    startDate: start,
    endDate: end,
    status: 'closed',
    color: 'var(--category-blue)',
    tagId: 'tag-1',
    activityId: 'activity-1',
    createdAt: start,
    updatedAt: end,
    version: '2026-07-15T00:00:00.000000Z',
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
    isMultiDay: false,
    kind: 'plan',
    ...overrides,
  };
}

describe('buildTimeblockDayDiffPlans', () => {
  it('kind !== plan の entry は除外する', () => {
    const plans = buildTimeblockDayDiffPlans([entry({ id: 'record-1', kind: 'record' })], {
      dayBounds: [],
      isEntryVisible: () => true,
    });
    expect(plans).toHaveLength(0);
  });

  it('dayBounds=[]（常に visible）では非表示アクティビティでも isIncludedInDiff は可視性だけで決まる', () => {
    const [plan] = buildTimeblockDayDiffPlans([entry()], {
      dayBounds: [],
      isEntryVisible: () => false,
    });
    expect(plan?.isIncludedInDiff).toBe(false);
  });

  it('dayBounds を渡すと範囲外の plan は isIncludedInDiff=false になるが除外はされない（関係解決に残す）', () => {
    const outOfRangeStart = new Date('2026-06-10T09:00:00.000Z');
    const outOfRangeEnd = new Date('2026-06-10T10:00:00.000Z');
    const [plan] = buildTimeblockDayDiffPlans(
      [entry({ startDate: outOfRangeStart, endDate: outOfRangeEnd })],
      {
        dayBounds: [
          {
            dayStart: new Date('2026-06-18T00:00:00.000Z'),
            dayEnd: new Date('2026-06-19T00:00:00.000Z'),
          },
        ],
        isEntryVisible: () => true,
      },
    );
    expect(plan?.isIncludedInDiff).toBe(false);
    expect(plan?.id).toBe('plan-1');
  });

  it('isSkipped の plan は skippedAt を持つ', () => {
    const [plan] = buildTimeblockDayDiffPlans([entry({ isSkipped: true })], {
      dayBounds: [],
      isEntryVisible: () => true,
    });
    expect(plan?.skippedAt).toEqual(plan?.startAt);
  });
});

describe('buildTimeblockDayDiffRecords', () => {
  it('kind !== record の entry は除外する', () => {
    const records = buildTimeblockDayDiffRecords([entry()], {
      dayBounds: [],
      isEntryVisible: () => true,
    });
    expect(records).toHaveLength(0);
  });

  it('非表示アクティビティの record は isEntryVisible の時点で除外する', () => {
    const records = buildTimeblockDayDiffRecords([entry({ id: 'record-1', kind: 'record' })], {
      dayBounds: [],
      isEntryVisible: () => false,
    });
    expect(records).toHaveLength(0);
  });

  it('dayBounds 範囲外の record は除外する（plan と異なり関係解決の必要が無い）', () => {
    const outOfRangeStart = new Date('2026-06-10T09:00:00.000Z');
    const outOfRangeEnd = new Date('2026-06-10T10:00:00.000Z');
    const records = buildTimeblockDayDiffRecords(
      [
        entry({
          id: 'record-1',
          kind: 'record',
          startDate: outOfRangeStart,
          endDate: outOfRangeEnd,
        }),
      ],
      {
        dayBounds: [
          {
            dayStart: new Date('2026-06-18T00:00:00.000Z'),
            dayEnd: new Date('2026-06-19T00:00:00.000Z'),
          },
        ],
        isEntryVisible: () => true,
      },
    );
    expect(records).toHaveLength(0);
  });
});
