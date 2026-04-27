import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { EntryWithTags } from '@/features/entry';

import { entryToCalendarEvent, expandEntriesToCalendarEvents } from '../entry-adapter';

const TZ = 'Asia/Tokyo';

function makeEntry(overrides: Partial<EntryWithTags> & { id: string }): EntryWithTags {
  return {
    user_id: 'user-1',
    title: 'Sample',
    description: null,
    origin: 'planned',
    start_time: '2026-04-27T01:00:00.000Z', // JST 10:00
    end_time: '2026-04-27T02:00:00.000Z', // JST 11:00
    actual_start_time: null,
    actual_end_time: null,
    duration_minutes: null,
    fulfillment_score: null,
    created_at: '2026-04-26T00:00:00.000Z',
    updated_at: '2026-04-26T00:00:00.000Z',
    tagId: null,
    ...overrides,
  };
}

describe('entryToCalendarEvent', () => {
  it('start_time / end_time が欠落している場合は null を返す', () => {
    expect(entryToCalendarEvent(makeEntry({ id: 'e1', start_time: null }), TZ)).toBeNull();
    expect(entryToCalendarEvent(makeEntry({ id: 'e2', end_time: null }), TZ)).toBeNull();
  });

  it('planned エントリは start_time / end_time を表示位置として使う', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        origin: 'planned',
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T02:00:00.000Z',
        actual_start_time: '2026-04-27T05:00:00.000Z', // 別時刻でも planned では無視
        actual_end_time: '2026-04-27T06:00:00.000Z',
      }),
      TZ,
    );

    expect(event).not.toBeNull();
    expect(event!.startDate!.toISOString()).toBe('2026-04-27T01:00:00.000Z');
    expect(event!.endDate!.toISOString()).toBe('2026-04-27T02:00:00.000Z');
  });

  it('unplanned エントリは actual_start_time / actual_end_time を表示位置として使う', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        origin: 'unplanned',
        // unplanned は start_time = end_time（duration=0）でも actual を表示
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T01:00:00.000Z',
        actual_start_time: '2026-04-27T05:00:00.000Z',
        actual_end_time: '2026-04-27T06:00:00.000Z',
      }),
      TZ,
    );

    expect(event!.startDate!.toISOString()).toBe('2026-04-27T05:00:00.000Z');
    expect(event!.endDate!.toISOString()).toBe('2026-04-27T06:00:00.000Z');
  });

  it('unplanned で actual 時間が無い場合は start_time / end_time にフォールバック', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        origin: 'unplanned',
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T02:00:00.000Z',
        actual_start_time: null,
        actual_end_time: null,
      }),
      TZ,
    );

    expect(event!.startDate!.toISOString()).toBe('2026-04-27T01:00:00.000Z');
    expect(event!.endDate!.toISOString()).toBe('2026-04-27T02:00:00.000Z');
  });

  it('分は 15 分単位にスナップされる（30 秒以上で繰り上げ）', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        // JST 10:07:45 → 10:08 → 15 分単位で 10:15
        start_time: '2026-04-27T01:07:45.000Z',
        end_time: '2026-04-27T02:00:00.000Z',
      }),
      TZ,
    );

    expect(event!.startDate!.getUTCMinutes()).toBe(15);
    expect(event!.startDate!.getUTCSeconds()).toBe(0);
    expect(event!.startDate!.getUTCMilliseconds()).toBe(0);
  });

  it('duration_minutes が指定されていればそれを優先する', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T02:00:00.000Z',
        duration_minutes: 90,
      }),
      TZ,
    );

    expect(event!.duration).toBe(90);
  });

  it('duration_minutes が無ければ start/end 差分から算出する', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T02:30:00.000Z',
        duration_minutes: null,
      }),
      TZ,
    );

    expect(event!.duration).toBe(90);
  });

  it('ユーザー TZ で同日なら isMultiDay=false', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        // JST 10:00–22:00（同日）
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T13:00:00.000Z',
      }),
      TZ,
    );

    expect(event!.isMultiDay).toBe(false);
  });

  it('ユーザー TZ で日付を跨ぐ場合は isMultiDay=true', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        // JST 23:00 (4/27) → JST 01:00 (4/28)
        start_time: '2026-04-27T14:00:00.000Z',
        end_time: '2026-04-27T16:00:00.000Z',
      }),
      TZ,
    );

    expect(event!.isMultiDay).toBe(true);
  });

  describe('status / entryState（時間位置ベースで自動判定）', () => {
    beforeAll(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-27T03:00:00.000Z')); // JST 12:00
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('end_time が現在より過去なら status=closed / entryState=past', () => {
      const event = entryToCalendarEvent(
        makeEntry({
          id: 'e1',
          start_time: '2026-04-27T01:00:00.000Z',
          end_time: '2026-04-27T02:00:00.000Z',
        }),
        TZ,
      );

      expect(event!.status).toBe('closed');
      expect(event!.entryState).toBe('past');
    });

    it('start_time が未来なら status=open / entryState=upcoming', () => {
      const event = entryToCalendarEvent(
        makeEntry({
          id: 'e1',
          start_time: '2026-04-27T05:00:00.000Z',
          end_time: '2026-04-27T06:00:00.000Z',
        }),
        TZ,
      );

      expect(event!.status).toBe('open');
      expect(event!.entryState).toBe('upcoming');
    });

    it('start_time <= now < end_time なら status=open / entryState=active', () => {
      const event = entryToCalendarEvent(
        makeEntry({
          id: 'e1',
          start_time: '2026-04-27T02:30:00.000Z',
          end_time: '2026-04-27T03:30:00.000Z',
        }),
        TZ,
      );

      expect(event!.status).toBe('open');
      expect(event!.entryState).toBe('active');
    });
  });

  it('tagId / fulfillmentScore / actualStart/EndDate を伝播する', () => {
    const event = entryToCalendarEvent(
      makeEntry({
        id: 'e1',
        tagId: 'tag-123',
        fulfillment_score: 3,
        actual_start_time: '2026-04-27T01:10:00.000Z',
        actual_end_time: '2026-04-27T02:00:00.000Z',
      }),
      TZ,
    );

    expect(event!.tagId).toBe('tag-123');
    expect(event!.fulfillmentScore).toBe(3);
    expect(event!.actualStartDate?.toISOString()).toBe('2026-04-27T01:10:00.000Z');
    expect(event!.actualEndDate?.toISOString()).toBe('2026-04-27T02:00:00.000Z');
  });
});

describe('expandEntriesToCalendarEvents', () => {
  it('start/end が欠落しているエントリを除外する', () => {
    const events = expandEntriesToCalendarEvents(
      [makeEntry({ id: 'ok' }), makeEntry({ id: 'broken', start_time: null, end_time: null })],
      TZ,
    );

    expect(events.map((e) => e.id)).toEqual(['ok']);
  });

  it('空配列を渡すと空配列を返す', () => {
    expect(expandEntriesToCalendarEvents([], TZ)).toEqual([]);
  });
});
