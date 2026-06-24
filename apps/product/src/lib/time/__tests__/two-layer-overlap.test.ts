import { describe, expect, it } from 'vitest';

import { hasTwoLayerTimeConflict, rangesOverlap } from '@dayopt/domain';

describe('rangesOverlap', () => {
  it('半開区間として、終端と始端の接触は重複しない', () => {
    expect(
      rangesOverlap(
        '2026-01-15T10:00:00.000Z',
        '2026-01-15T11:00:00.000Z',
        '2026-01-15T11:00:00.000Z',
        '2026-01-15T12:00:00.000Z',
      ),
    ).toBe(false);
  });
});

describe('hasTwoLayerTimeConflict', () => {
  const existing = [
    {
      id: 'planned-a',
      plannedStart: '2026-01-15T10:00:00.000Z',
      plannedEnd: '2026-01-15T11:00:00.000Z',
      actualStart: '2026-01-15T12:00:00.000Z',
      actualEnd: '2026-01-15T13:00:00.000Z',
    },
  ];

  it('planned range同士の重複は衝突にする', () => {
    expect(
      hasTwoLayerTimeConflict(existing, {
        plannedStart: '2026-01-15T10:30:00.000Z',
        plannedEnd: '2026-01-15T10:45:00.000Z',
        actualStart: '2026-01-15T14:00:00.000Z',
        actualEnd: '2026-01-15T15:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('actual range同士の重複は衝突にする', () => {
    expect(
      hasTwoLayerTimeConflict(existing, {
        plannedStart: '2026-01-15T14:00:00.000Z',
        plannedEnd: '2026-01-15T15:00:00.000Z',
        actualStart: '2026-01-15T12:30:00.000Z',
        actualEnd: '2026-01-15T12:45:00.000Z',
      }),
    ).toBe(true);
  });

  it('planned rangeとactual rangeの交差だけなら許可する', () => {
    expect(
      hasTwoLayerTimeConflict(existing, {
        plannedStart: '2026-01-15T11:00:00.000Z',
        plannedEnd: '2026-01-15T12:30:00.000Z',
        actualStart: '2026-01-15T13:00:00.000Z',
        actualEnd: '2026-01-15T14:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('unplannedのactualEndがnowを超える場合は衝突にする', () => {
    expect(
      hasTwoLayerTimeConflict([], {
        actualStart: '2026-01-15T10:00:00.000Z',
        actualEnd: '2026-01-15T11:00:00.000Z',
        forbidFutureActual: true,
        now: new Date('2026-01-15T10:59:00.000Z').getTime(),
      }),
    ).toBe(true);
  });

  it('actual rangeがなくてもplanned rangeがあれば有効（自動記録モデル: 未来plannedはactual未編集）', () => {
    expect(
      hasTwoLayerTimeConflict([], {
        plannedStart: '2026-01-15T10:00:00.000Z',
        plannedEnd: '2026-01-15T11:00:00.000Z',
        actualStart: null,
        actualEnd: null,
      }),
    ).toBe(false);
  });

  it('planned/actual両方ないtargetは無効として衝突にする', () => {
    expect(
      hasTwoLayerTimeConflict([], {
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
      }),
    ).toBe(true);
  });

  it('actualが片側だけのtargetは無効として衝突にする', () => {
    expect(
      hasTwoLayerTimeConflict([], {
        plannedStart: '2026-01-15T10:00:00.000Z',
        plannedEnd: '2026-01-15T11:00:00.000Z',
        actualStart: '2026-01-15T10:00:00.000Z',
        actualEnd: null,
      }),
    ).toBe(true);
  });

  it('片側nullやend <= startのtarget rangeは無効として衝突にする', () => {
    expect(
      hasTwoLayerTimeConflict([], {
        plannedStart: '2026-01-15T10:00:00.000Z',
        plannedEnd: null,
        actualStart: '2026-01-15T12:00:00.000Z',
        actualEnd: '2026-01-15T12:00:00.000Z',
      }),
    ).toBe(true);
  });
});
