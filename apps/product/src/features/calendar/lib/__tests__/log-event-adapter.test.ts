import { describe, expect, it } from 'vitest';

import {
  expandLogRowsToLogEvents,
  logRowToLogEvent,
  type LogEventSourceRow,
} from '../log-event-adapter';

function makeRow(overrides: Partial<LogEventSourceRow> = {}): LogEventSourceRow {
  return {
    id: 'log-1',
    title: 'Deep Work',
    note: null,
    tag_id: 'tag-1',
    plan_id: null,
    start_at: '2026-07-10T09:00:00Z',
    end_at: '2026-07-10T10:00:00Z',
    fulfillment_score: null,
    ...overrides,
  };
}

describe('logRowToLogEvent', () => {
  it('基本フィールドを変換する', () => {
    const event = logRowToLogEvent(makeRow(), { timezone: 'UTC' });
    expect(event).toMatchObject({ id: 'log-1', title: 'Deep Work', tagId: 'tag-1', duration: 60 });
  });

  it('planId が無ければ diffMinutes は undefined（予定外の記録）', () => {
    const event = logRowToLogEvent(makeRow(), { timezone: 'UTC', plannedMinutes: 90 });
    expect(event.diffMinutes).toBeUndefined();
  });

  it('planId があり plannedMinutes が解決できれば diffMinutes を計算する（実績-予定）', () => {
    const event = logRowToLogEvent(makeRow({ plan_id: 'plan-1' }), {
      timezone: 'UTC',
      plannedMinutes: 45,
    });
    expect(event.diffMinutes).toBe(15); // 60分の実績 - 45分の予定
  });

  it('planId はあるが plannedMinutes が未解決(null)なら diffMinutes は undefined', () => {
    const event = logRowToLogEvent(makeRow({ plan_id: 'plan-1' }), {
      timezone: 'UTC',
      plannedMinutes: null,
    });
    expect(event.diffMinutes).toBeUndefined();
  });

  it('実績が予定ちょうどなら diffMinutes=0', () => {
    const event = logRowToLogEvent(makeRow({ plan_id: 'plan-1' }), {
      timezone: 'UTC',
      plannedMinutes: 60,
    });
    expect(event.diffMinutes).toBe(0);
  });
});

describe('expandLogRowsToLogEvents', () => {
  it('plannedMinutesByPlanId から各 log の diffMinutes を解決する（1 plan に複数 log の 1:N も対応）', () => {
    const rows = [
      makeRow({ id: 'l1', plan_id: 'p1' }),
      makeRow({ id: 'l2', plan_id: 'p1', end_at: '2026-07-10T09:20:00Z' }),
      makeRow({ id: 'l3', plan_id: null }),
    ];
    const events = expandLogRowsToLogEvents(rows, {
      timezone: 'UTC',
      plannedMinutesByPlanId: new Map([['p1', 60]]),
    });

    expect(events.find((e) => e.id === 'l1')?.diffMinutes).toBe(0);
    expect(events.find((e) => e.id === 'l2')?.diffMinutes).toBe(-40);
    expect(events.find((e) => e.id === 'l3')?.diffMinutes).toBeUndefined();
  });
});
