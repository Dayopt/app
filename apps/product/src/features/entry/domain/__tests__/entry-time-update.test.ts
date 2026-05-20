import { describe, expect, it } from 'vitest';

import type { EntryLike } from '../entry-time-model';
import {
  buildTimeUpdateData,
  buildUndoTimeUpdateData,
  hasActualRangeDiff,
  rangesMatch,
} from '../entry-time-update';

const PLANNED_START = '2026-03-12T09:00:00.000Z';
const PLANNED_END = '2026-03-12T10:00:00.000Z';
const ACTUAL_START = '2026-03-12T09:05:00.000Z';
const ACTUAL_END = '2026-03-12T10:10:00.000Z';

const NEW_START = new Date('2026-03-12T14:00:00.000Z');
const NEW_END = new Date('2026-03-12T15:00:00.000Z');
const NEW_START_ISO = NEW_START.toISOString();
const NEW_END_ISO = NEW_END.toISOString();

describe('rangesMatch', () => {
  it('両 range の時刻が完全一致すれば true', () => {
    expect(rangesMatch(PLANNED_START, PLANNED_END, PLANNED_START, PLANNED_END)).toBe(true);
  });

  it('start だけ違えば false', () => {
    expect(rangesMatch(PLANNED_START, PLANNED_END, ACTUAL_START, PLANNED_END)).toBe(false);
  });

  it('end だけ違えば false', () => {
    expect(rangesMatch(PLANNED_START, PLANNED_END, PLANNED_START, ACTUAL_END)).toBe(false);
  });

  it('両 range とも null なら true（同一とみなす）', () => {
    expect(rangesMatch(null, null, null, null)).toBe(true);
  });

  it('片方が undefined / もう片方が null だと false', () => {
    expect(rangesMatch(undefined, undefined, null, null)).toBe(false);
  });
});

describe('hasActualRangeDiff', () => {
  it('entry が null/undefined なら false', () => {
    expect(hasActualRangeDiff(null)).toBe(false);
    expect(hasActualRangeDiff(undefined)).toBe(false);
  });

  it('origin が unplanned なら false（unplanned は planned を持たない）', () => {
    expect(
      hasActualRangeDiff({
        origin: 'unplanned',
        actual_start_time: ACTUAL_START,
        actual_end_time: ACTUAL_END,
      }),
    ).toBe(false);
  });

  it('planned origin で planned == actual なら false', () => {
    expect(
      hasActualRangeDiff({
        origin: 'planned',
        start_time: PLANNED_START,
        end_time: PLANNED_END,
        actual_start_time: PLANNED_START,
        actual_end_time: PLANNED_END,
      }),
    ).toBe(false);
  });

  it('planned origin で actual_start がズレていれば true', () => {
    expect(
      hasActualRangeDiff({
        origin: 'planned',
        start_time: PLANNED_START,
        end_time: PLANNED_END,
        actual_start_time: ACTUAL_START,
        actual_end_time: PLANNED_END,
      }),
    ).toBe(true);
  });

  it('planned origin で actual_end がズレていれば true', () => {
    expect(
      hasActualRangeDiff({
        origin: 'planned',
        start_time: PLANNED_START,
        end_time: PLANNED_END,
        actual_start_time: PLANNED_START,
        actual_end_time: ACTUAL_END,
      }),
    ).toBe(true);
  });

  it('同じ duration で時刻全体がシフトしているケースでも true（hasPlannedActualDiff と違う点）', () => {
    expect(
      hasActualRangeDiff({
        origin: 'planned',
        start_time: '2026-03-12T09:00:00.000Z',
        end_time: '2026-03-12T10:00:00.000Z',
        actual_start_time: '2026-03-12T09:30:00.000Z',
        actual_end_time: '2026-03-12T10:30:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('buildTimeUpdateData', () => {
  it('entry が null（新規作成）なら planned/actual 両方を新時刻に揃える', () => {
    const result = buildTimeUpdateData(null, NEW_START, NEW_END);
    expect(result).toEqual({
      start_time: NEW_START_ISO,
      end_time: NEW_END_ISO,
      actual_start_time: NEW_START_ISO,
      actual_end_time: NEW_END_ISO,
    });
  });

  it('planned origin で resetActualTime=true なら planned/actual 両方を新時刻に揃える', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    const result = buildTimeUpdateData(entry, NEW_START, NEW_END, true);
    expect(result).toEqual({
      start_time: NEW_START_ISO,
      end_time: NEW_END_ISO,
      actual_start_time: NEW_START_ISO,
      actual_end_time: NEW_END_ISO,
    });
  });

  it('unplanned origin なら actual だけ更新（planned は触らない）', () => {
    const entry: EntryLike = {
      origin: 'unplanned',
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    const result = buildTimeUpdateData(entry, NEW_START, NEW_END);
    expect(result).toEqual({
      actual_start_time: NEW_START_ISO,
      actual_end_time: NEW_END_ISO,
    });
  });

  it('planned origin で actual に差分があり resetActualTime=false なら planned のみ更新', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    const result = buildTimeUpdateData(entry, NEW_START, NEW_END, false);
    expect(result).toEqual({
      start_time: NEW_START_ISO,
      end_time: NEW_END_ISO,
    });
  });

  it('planned origin で actual と一致しているなら planned/actual 両方を新時刻に揃える', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: PLANNED_START,
      actual_end_time: PLANNED_END,
    };
    const result = buildTimeUpdateData(entry, NEW_START, NEW_END);
    expect(result).toEqual({
      start_time: NEW_START_ISO,
      end_time: NEW_END_ISO,
      actual_start_time: NEW_START_ISO,
      actual_end_time: NEW_END_ISO,
    });
  });

  it('origin 不明なら actual のみ更新（フォールバック）', () => {
    const entry: EntryLike = { origin: null };
    const result = buildTimeUpdateData(entry, NEW_START, NEW_END);
    expect(result).toEqual({
      actual_start_time: NEW_START_ISO,
      actual_end_time: NEW_END_ISO,
    });
  });
});

describe('buildUndoTimeUpdateData', () => {
  it('entry が null なら null', () => {
    expect(buildUndoTimeUpdateData(null)).toBeNull();
    expect(buildUndoTimeUpdateData(undefined)).toBeNull();
  });

  it('unplanned origin: actual を書き戻す', () => {
    const entry: EntryLike = {
      origin: 'unplanned',
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    expect(buildUndoTimeUpdateData(entry)).toEqual({
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    });
  });

  it('unplanned origin で actual が欠けていれば null', () => {
    const entry: EntryLike = { origin: 'unplanned', actual_start_time: ACTUAL_START };
    expect(buildUndoTimeUpdateData(entry)).toBeNull();
  });

  it('resetActualTime=true: 4 フィールドすべて書き戻す', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    expect(buildUndoTimeUpdateData(entry, true)).toEqual({
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    });
  });

  it('resetActualTime=true で 1 フィールドでも欠けていれば null', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: ACTUAL_START,
      // actual_end_time 欠落
    };
    expect(buildUndoTimeUpdateData(entry, true)).toBeNull();
  });

  it('planned origin で actual に差分があれば planned のみ書き戻す', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    expect(buildUndoTimeUpdateData(entry, false)).toEqual({
      start_time: PLANNED_START,
      end_time: PLANNED_END,
    });
  });

  it('planned origin で actual に差分があり planned が欠けていれば null', () => {
    const entry: EntryLike = {
      origin: 'planned',
      actual_start_time: ACTUAL_START,
      actual_end_time: ACTUAL_END,
    };
    // hasActualRangeDiff は planned/actual の不一致を見るが planned が空なら判定上 true 扱い
    expect(buildUndoTimeUpdateData(entry, false)).toBeNull();
  });

  it('planned origin で actual と一致 → 4 フィールドすべて書き戻す', () => {
    const entry: EntryLike = {
      origin: 'planned',
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: PLANNED_START,
      actual_end_time: PLANNED_END,
    };
    expect(buildUndoTimeUpdateData(entry, false)).toEqual({
      start_time: PLANNED_START,
      end_time: PLANNED_END,
      actual_start_time: PLANNED_START,
      actual_end_time: PLANNED_END,
    });
  });
});
