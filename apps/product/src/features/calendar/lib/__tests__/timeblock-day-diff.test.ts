import { describe, expect, it } from 'vitest';

import { computeTimeblockDayDiffs } from '../timeblock-day-diff';

const at = (hour: number) => new Date(`2026-07-10T${String(hour).padStart(2, '0')}:00:00.000Z`);
const plan = {
  id: 'plan-1',
  title: 'Plan',
  tagId: 'tag-1',
  color: 'blue',
  startAt: at(9),
  endAt: at(10),
  skippedAt: null,
};

describe('computeTimeblockDayDiffs', () => {
  it('記録のない Plan を未記録として集計する', () => {
    const result = computeTimeblockDayDiffs([plan], []);
    expect(result.summary).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 0,
      unrecordedMinutes: 60,
    });
    expect(result.items[0]?.kind).toBe('unrecorded');
  });

  it('複数 Record を一つの Plan に合算する', () => {
    const result = computeTimeblockDayDiffs(
      [plan],
      [
        {
          id: 'record-1',
          planId: 'plan-1',
          title: 'Record',
          tagId: 'tag-1',
          color: 'blue',
          startAt: at(9),
          endAt: at(10),
        },
        {
          id: 'record-2',
          planId: 'plan-1',
          title: 'Record',
          tagId: 'tag-1',
          color: 'blue',
          startAt: at(10),
          endAt: at(11),
        },
      ],
    );
    expect(result.items[0]).toMatchObject({
      kind: 'recorded',
      actualMinutes: 120,
      diffMinutes: 60,
    });
  });

  it('Planが表示範囲外でも範囲内の関連Recordを予定に対する記録として残す', () => {
    const records = [
      {
        id: 'record-next-day',
        planId: plan.id,
        title: 'Record',
        tagId: 'tag-1',
        color: 'blue',
        startAt: new Date('2026-07-11T09:00:00.000Z'),
        endAt: new Date('2026-07-11T10:00:00.000Z'),
      },
    ];
    const result = computeTimeblockDayDiffs([plan], records, {
      dayStart: new Date('2026-07-11T00:00:00.000Z'),
      dayEnd: new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(result.summary).toMatchObject({
      plannedMinutes: 0,
      actualMinutes: 60,
      unplannedMinutes: 0,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: 'recorded',
      timeblockId: plan.id,
      plannedMinutes: 0,
      actualMinutes: 60,
      diffMinutes: 60,
    });

    const planDayResult = computeTimeblockDayDiffs([plan], records, {
      dayStart: new Date('2026-07-10T00:00:00.000Z'),
      dayEnd: new Date('2026-07-11T00:00:00.000Z'),
    });
    expect(planDayResult.summary).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 0,
      unrecordedMinutes: 60,
    });
    expect(planDayResult.items[0]?.kind).toBe('unrecorded');
  });

  it('集計対象外のPlanを関連判定だけに使う', () => {
    const result = computeTimeblockDayDiffs(
      [{ ...plan, isIncludedInDiff: false }],
      [
        {
          id: 'visible-record',
          planId: plan.id,
          title: 'Record',
          tagId: 'tag-2',
          color: 'green',
          startAt: at(9),
          endAt: at(10),
        },
      ],
    );

    expect(result.summary).toMatchObject({
      plannedMinutes: 0,
      actualMinutes: 60,
      unplannedMinutes: 0,
    });
    expect(result.items[0]).toMatchObject({
      kind: 'recorded',
      plannedMinutes: 0,
      actualMinutes: 60,
    });
  });

  it('Plan のない、または削除済み Plan の Record を予定外として扱う', () => {
    const record = {
      id: 'record-1',
      planId: 'deleted',
      title: 'Record',
      tagId: null,
      color: 'gray',
      startAt: at(9),
      endAt: at(10),
    };
    const result = computeTimeblockDayDiffs(
      [{ ...plan, id: 'deleted', deletedAt: at(11) }],
      [record],
    );
    expect(result.summary.unplannedMinutes).toBe(60);
    expect(result.items[0]?.kind).toBe('unplanned');
  });

  it('skip は予定を残し、未記録には含めない', () => {
    const result = computeTimeblockDayDiffs([{ ...plan, skippedAt: at(11) }], []);
    expect(result.summary).toMatchObject({ plannedMinutes: 60, unrecordedMinutes: 0 });
    expect(result.items[0]?.kind).toBe('skipped');
  });
});
