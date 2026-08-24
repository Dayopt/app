import { describe, expect, it } from 'vitest';

import {
  expandPlanRowsToPlanEvents,
  planRowToPlanEvent,
  type PlanEventSourceRow,
} from '../plan-event-adapter';

const NOW = new Date('2026-07-10T12:00:00Z');

function makeRow(overrides: Partial<PlanEventSourceRow> = {}): PlanEventSourceRow {
  return {
    id: 'plan-1',
    title: 'Deep Work',
    note: null,
    activity_id: null,
    start_at: '2026-07-10T09:00:00Z',
    end_at: '2026-07-10T10:00:00Z',
    skipped_at: null,
    ...overrides,
  };
}

describe('planRowToPlanEvent', () => {
  it('基本フィールドを変換する', () => {
    const event = planRowToPlanEvent(makeRow(), { timezone: 'UTC', isRecorded: false, now: NOW });
    expect(event).toMatchObject({
      id: 'plan-1',
      title: 'Deep Work',
      activityId: null,
      duration: 60,
    });
  });

  it('title が空文字なら空文字のまま保持する（表示側でフォールバック）', () => {
    const event = planRowToPlanEvent(makeRow({ title: '' }), {
      timezone: 'UTC',
      isRecorded: false,
      now: NOW,
    });
    expect(event.title).toBe('');
  });

  it('skipped_at があれば status=skipped（記録済み・時間位置より優先）', () => {
    const event = planRowToPlanEvent(makeRow({ skipped_at: '2026-07-10T11:00:00Z' }), {
      timezone: 'UTC',
      isRecorded: true,
      now: NOW,
    });
    expect(event.status).toBe('skipped');
  });

  it('記録済み(isRecorded)なら時間位置に関わらず status=recorded', () => {
    const event = planRowToPlanEvent(makeRow(), { timezone: 'UTC', isRecorded: true, now: NOW });
    expect(event.status).toBe('recorded');
  });

  it('過去・未記録・未skip なら status=unrecorded', () => {
    const event = planRowToPlanEvent(makeRow(), { timezone: 'UTC', isRecorded: false, now: NOW });
    expect(event.status).toBe('unrecorded');
  });

  it('進行中(start<=now<end)なら status=active', () => {
    const event = planRowToPlanEvent(
      makeRow({ start_at: '2026-07-10T11:30:00Z', end_at: '2026-07-10T13:00:00Z' }),
      { timezone: 'UTC', isRecorded: false, now: NOW },
    );
    expect(event.status).toBe('active');
  });

  it('未来(start>now)なら status=upcoming', () => {
    const event = planRowToPlanEvent(
      makeRow({ start_at: '2026-07-10T13:00:00Z', end_at: '2026-07-10T14:00:00Z' }),
      { timezone: 'UTC', isRecorded: false, now: NOW },
    );
    expect(event.status).toBe('upcoming');
  });
});

describe('expandPlanRowsToPlanEvents', () => {
  it('recordedPlanIds に含まれる id は status=recorded になる', () => {
    const rows = [makeRow({ id: 'p1' }), makeRow({ id: 'p2' })];
    const events = expandPlanRowsToPlanEvents(rows, {
      timezone: 'UTC',
      recordedPlanIds: new Set(['p1']),
      now: NOW,
    });
    expect(events.find((e) => e.id === 'p1')?.status).toBe('recorded');
    expect(events.find((e) => e.id === 'p2')?.status).toBe('unrecorded');
  });
});
