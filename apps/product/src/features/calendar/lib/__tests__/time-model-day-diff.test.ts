import { describe, expect, it } from 'vitest';

import { computeTimeModelDayDiffs } from '../time-model-day-diff';

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

describe('computeTimeModelDayDiffs', () => {
  it('記録のない Plan を未記録として集計する', () => {
    const result = computeTimeModelDayDiffs([plan], []);
    expect(result.summary).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 0,
      unrecordedMinutes: 60,
    });
    expect(result.items[0]?.kind).toBe('unrecorded');
  });

  it('複数 Log を一つの Plan に合算する', () => {
    const result = computeTimeModelDayDiffs(
      [plan],
      [
        {
          id: 'log-1',
          planId: 'plan-1',
          title: 'Log',
          tagId: 'tag-1',
          color: 'blue',
          startAt: at(9),
          endAt: at(10),
        },
        {
          id: 'log-2',
          planId: 'plan-1',
          title: 'Log',
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

  it('Plan のない、または削除済み Plan の Log を予定外として扱う', () => {
    const log = {
      id: 'log-1',
      planId: 'deleted',
      title: 'Log',
      tagId: null,
      color: 'gray',
      startAt: at(9),
      endAt: at(10),
    };
    const result = computeTimeModelDayDiffs([{ ...plan, id: 'deleted', deletedAt: at(11) }], [log]);
    expect(result.summary.unplannedMinutes).toBe(60);
    expect(result.items[0]?.kind).toBe('unplanned');
  });

  it('skip は予定を残し、未記録には含めない', () => {
    const result = computeTimeModelDayDiffs([{ ...plan, skippedAt: at(11) }], []);
    expect(result.summary).toMatchObject({ plannedMinutes: 60, unrecordedMinutes: 0 });
    expect(result.items[0]?.kind).toBe('skipped');
  });
});
