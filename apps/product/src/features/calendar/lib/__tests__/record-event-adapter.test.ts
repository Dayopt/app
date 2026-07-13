import { describe, expect, it } from 'vitest';

import {
  expandRecordRowsToRecordEvents,
  recordRowToRecordEvent,
  type RecordEventSourceRow,
} from '../record-event-adapter';

function makeRow(overrides: Partial<RecordEventSourceRow> = {}): RecordEventSourceRow {
  return {
    id: 'record-1',
    title: 'Deep Work',
    note: null,
    tag_id: 'tag-1',
    plan_id: null,
    source: 'manual',
    start_at: '2026-07-10T09:00:00Z',
    end_at: '2026-07-10T10:00:00Z',
    fulfillment_score: null,
    ...overrides,
  };
}

describe('recordRowToRecordEvent', () => {
  it('基本フィールドを変換する', () => {
    const event = recordRowToRecordEvent(makeRow(), { timezone: 'UTC' });
    expect(event).toMatchObject({
      id: 'record-1',
      title: 'Deep Work',
      tagId: 'tag-1',
      duration: 60,
    });
  });

  it('planId が無ければ diffMinutes は undefined（予定外の記録）', () => {
    const event = recordRowToRecordEvent(makeRow(), { timezone: 'UTC', plannedMinutes: 90 });
    expect(event.diffMinutes).toBeUndefined();
  });

  it('planId があり plannedMinutes が解決できれば diffMinutes を計算する（実績-予定）', () => {
    const event = recordRowToRecordEvent(makeRow({ plan_id: 'plan-1' }), {
      timezone: 'UTC',
      plannedMinutes: 45,
    });
    expect(event.diffMinutes).toBe(15); // 60分の実績 - 45分の予定
  });

  it('planId はあるが plannedMinutes が未解決(null)なら diffMinutes は undefined', () => {
    const event = recordRowToRecordEvent(makeRow({ plan_id: 'plan-1' }), {
      timezone: 'UTC',
      plannedMinutes: null,
    });
    expect(event.diffMinutes).toBeUndefined();
  });

  it('実績が予定ちょうどなら diffMinutes=0', () => {
    const event = recordRowToRecordEvent(makeRow({ plan_id: 'plan-1' }), {
      timezone: 'UTC',
      plannedMinutes: 60,
    });
    expect(event.diffMinutes).toBe(0);
  });
});

describe('expandRecordRowsToRecordEvents', () => {
  it('plannedMinutesByPlanId から各 record の diffMinutes を解決する（1 record : 1 plan）', () => {
    const rows = [
      makeRow({ id: 'l1', plan_id: 'p1', source: 'from_plan' }),
      makeRow({
        id: 'l2',
        plan_id: null,
        end_at: '2026-07-10T09:20:00Z',
      }),
    ];
    const events = expandRecordRowsToRecordEvents(rows, {
      timezone: 'UTC',
      plannedMinutesByPlanId: new Map([['p1', 60]]),
    });

    expect(events.find((e) => e.id === 'l1')?.diffMinutes).toBe(0);
    expect(events.find((e) => e.id === 'l2')?.diffMinutes).toBeUndefined();
  });

  it('1 plan に複数 record（分割記録）は合計実績で 1 件にのみ差分を付与する（1:N、二重計上を避ける）', () => {
    // 60分 plan を 30分 record 2件で記録 → 合計は予定どおり(diff=0)。
    // 個別の record 時間(30分)だけで計算すると誤って -30min が 2 件出る不具合の回帰テスト。
    const rows = [
      makeRow({
        id: 'l1',
        plan_id: 'p1',
        source: 'from_plan',
        start_at: '2026-07-10T09:00:00Z',
        end_at: '2026-07-10T09:30:00Z',
      }),
      makeRow({
        id: 'l2',
        plan_id: 'p1',
        source: 'manual',
        start_at: '2026-07-10T09:30:00Z',
        end_at: '2026-07-10T10:00:00Z',
      }),
    ];
    const events = expandRecordRowsToRecordEvents(rows, {
      timezone: 'UTC',
      plannedMinutesByPlanId: new Map([['p1', 60]]),
    });

    // from_plan の record が代表として合計実績(60分)ベースの差分を持つ
    expect(events.find((e) => e.id === 'l1')?.diffMinutes).toBe(0);
    // 他方の record は個別の差分を持たない（二重計上を避ける）
    expect(events.find((e) => e.id === 'l2')?.diffMinutes).toBeUndefined();
  });

  it('1:N の分割記録が予定より多い/少ない場合、合計実績ベースの差分になる', () => {
    // 60分 plan を 20分 + 20分 = 40分の実績で記録 → -20min
    const rows = [
      makeRow({
        id: 'l1',
        plan_id: 'p1',
        source: 'from_plan',
        start_at: '2026-07-10T09:00:00Z',
        end_at: '2026-07-10T09:20:00Z',
      }),
      makeRow({
        id: 'l2',
        plan_id: 'p1',
        source: 'manual',
        start_at: '2026-07-10T09:20:00Z',
        end_at: '2026-07-10T09:40:00Z',
      }),
    ];
    const events = expandRecordRowsToRecordEvents(rows, {
      timezone: 'UTC',
      plannedMinutesByPlanId: new Map([['p1', 60]]),
    });

    expect(events.find((e) => e.id === 'l1')?.diffMinutes).toBe(-20);
    expect(events.find((e) => e.id === 'l2')?.diffMinutes).toBeUndefined();
  });

  it('from_plan の record が無い場合は最初に現れた record を代表にする', () => {
    const rows = [
      makeRow({
        id: 'l1',
        plan_id: 'p1',
        source: 'manual',
        start_at: '2026-07-10T09:00:00Z',
        end_at: '2026-07-10T09:30:00Z',
      }),
      makeRow({
        id: 'l2',
        plan_id: 'p1',
        source: 'manual',
        start_at: '2026-07-10T09:30:00Z',
        end_at: '2026-07-10T10:00:00Z',
      }),
    ];
    const events = expandRecordRowsToRecordEvents(rows, {
      timezone: 'UTC',
      plannedMinutesByPlanId: new Map([['p1', 60]]),
    });

    expect(events.find((e) => e.id === 'l1')?.diffMinutes).toBe(0);
    expect(events.find((e) => e.id === 'l2')?.diffMinutes).toBeUndefined();
  });

  it('秒以下の端数は truncateToMinute 後の duration で集計する（生の timestamp 差分を使わない）', () => {
    // 09:00:31 - 10:00:00 は truncateToMinute で 09:00:00 - 10:00:00 = 60分。
    // 生の timestamp 差分（59分29秒）を丸めると 59分になり、60分 plan に対して
    // 誤って -1min の差分が出てしまう回帰テスト。
    const rows = [
      makeRow({
        id: 'l1',
        plan_id: 'p1',
        source: 'from_plan',
        start_at: '2026-07-10T09:00:31Z',
        end_at: '2026-07-10T10:00:00Z',
      }),
    ];
    const events = expandRecordRowsToRecordEvents(rows, {
      timezone: 'UTC',
      plannedMinutesByPlanId: new Map([['p1', 60]]),
    });

    expect(events[0]?.duration).toBe(60);
    expect(events[0]?.diffMinutes).toBe(0);
  });
});
