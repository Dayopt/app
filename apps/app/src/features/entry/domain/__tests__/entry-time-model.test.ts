import { describe, expect, it } from 'vitest';

import {
  determineEntryOrigin,
  getActualMinutes,
  getActualRange,
  getDiffMinutes,
  getPlannedMinutes,
  getPlannedRange,
  hasPlannedActualDiff,
  isPlannedEntry,
  isUnplannedEntry,
} from '../entry-time-model';

const NOW = new Date('2026-03-12T12:00:00Z');
const PAST = '2026-03-12T11:00:00Z'; // 1h before NOW
const FUTURE = '2026-03-12T13:00:00Z'; // 1h after NOW

describe('determineEntryOrigin', () => {
  it('end が now より前なら unplanned', () => {
    expect(determineEntryOrigin(PAST, NOW)).toBe('unplanned');
  });

  it('end が now と同時刻なら unplanned（境界値）', () => {
    expect(determineEntryOrigin(NOW, NOW)).toBe('unplanned');
  });

  it('end が now より後なら planned', () => {
    expect(determineEntryOrigin(FUTURE, NOW)).toBe('planned');
  });

  it('Date オブジェクトでも動作する', () => {
    const past = new Date('2026-03-12T10:00:00Z');
    expect(determineEntryOrigin(past, NOW)).toBe('unplanned');
    const future = new Date('2026-03-12T14:00:00Z');
    expect(determineEntryOrigin(future, NOW)).toBe('planned');
  });
});

describe('isPlannedEntry / isUnplannedEntry', () => {
  it('origin が planned なら isPlannedEntry = true', () => {
    expect(isPlannedEntry({ origin: 'planned' })).toBe(true);
    expect(isUnplannedEntry({ origin: 'planned' })).toBe(false);
  });

  it('origin が unplanned なら isUnplannedEntry = true', () => {
    expect(isUnplannedEntry({ origin: 'unplanned' })).toBe(true);
    expect(isPlannedEntry({ origin: 'unplanned' })).toBe(false);
  });

  it('origin が null なら両方 false', () => {
    expect(isPlannedEntry({ origin: null })).toBe(false);
    expect(isUnplannedEntry({ origin: null })).toBe(false);
  });

  it('origin が undefined なら両方 false', () => {
    expect(isPlannedEntry({})).toBe(false);
    expect(isUnplannedEntry({})).toBe(false);
  });
});

describe('getPlannedRange', () => {
  it('start_time / end_time が揃っていれば TimeRange を返す', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
    };
    const range = getPlannedRange(entry);
    expect(range).not.toBeNull();
    expect(range!.start).toEqual(new Date('2026-03-12T09:00:00Z'));
    expect(range!.end).toEqual(new Date('2026-03-12T10:00:00Z'));
  });

  it('start_time が null なら null', () => {
    expect(getPlannedRange({ start_time: null, end_time: '2026-03-12T10:00:00Z' })).toBeNull();
  });

  it('end_time が null なら null', () => {
    expect(getPlannedRange({ start_time: '2026-03-12T09:00:00Z', end_time: null })).toBeNull();
  });

  it('両方 undefined なら null', () => {
    expect(getPlannedRange({})).toBeNull();
  });
});

describe('getActualRange', () => {
  it('actual_start / actual_end が揃っていれば TimeRange を返す', () => {
    const entry = {
      actual_start_time: '2026-03-12T09:05:00Z',
      actual_end_time: '2026-03-12T10:10:00Z',
    };
    const range = getActualRange(entry);
    expect(range).not.toBeNull();
    expect(range!.start).toEqual(new Date('2026-03-12T09:05:00Z'));
    expect(range!.end).toEqual(new Date('2026-03-12T10:10:00Z'));
  });

  it('actual_start_time が null なら null', () => {
    expect(
      getActualRange({ actual_start_time: null, actual_end_time: '2026-03-12T10:00:00Z' }),
    ).toBeNull();
  });

  it('両方なければ null', () => {
    expect(getActualRange({})).toBeNull();
  });
});

describe('getPlannedMinutes', () => {
  it('duration_minutes が保存済みなら優先して返す', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
      duration_minutes: 45, // range は 60 分だが保存値を優先
    };
    expect(getPlannedMinutes(entry)).toBe(45);
  });

  it('duration_minutes が null なら range から算出', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:30:00Z',
      duration_minutes: null,
    };
    expect(getPlannedMinutes(entry)).toBe(90);
  });

  it('planned range がなければ null', () => {
    expect(getPlannedMinutes({ start_time: null, end_time: null })).toBeNull();
  });
});

describe('getActualMinutes', () => {
  it('actual range から分数を算出する', () => {
    const entry = {
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:15:00Z',
    };
    expect(getActualMinutes(entry)).toBe(75);
  });

  it('duration_minutes は無視して actual range を使う', () => {
    const entry = {
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:00:00Z',
      duration_minutes: 999,
    };
    expect(getActualMinutes(entry)).toBe(60);
  });

  it('actual range がなければ null', () => {
    expect(getActualMinutes({})).toBeNull();
  });
});

describe('getDiffMinutes', () => {
  it('actual - planned を返す（actual が長い → 正）', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:30:00Z',
      duration_minutes: null,
    };
    expect(getDiffMinutes(entry)).toBe(30);
  });

  it('actual が短ければ負の値', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T09:45:00Z',
      duration_minutes: null,
    };
    expect(getDiffMinutes(entry)).toBe(-15);
  });

  it('planned がなければ null', () => {
    const entry = {
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:00:00Z',
    };
    expect(getDiffMinutes(entry)).toBeNull();
  });

  it('actual がなければ null', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
    };
    expect(getDiffMinutes(entry)).toBeNull();
  });
});

describe('hasPlannedActualDiff', () => {
  it('差分がある場合は true', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:30:00Z',
      duration_minutes: null,
    };
    expect(hasPlannedActualDiff(entry)).toBe(true);
  });

  it('planned と actual が同じ時間なら false', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:00:00Z',
      duration_minutes: null,
    };
    expect(hasPlannedActualDiff(entry)).toBe(false);
  });

  it('planned range がなければ false', () => {
    const entry = {
      actual_start_time: '2026-03-12T09:00:00Z',
      actual_end_time: '2026-03-12T10:00:00Z',
    };
    expect(hasPlannedActualDiff(entry)).toBe(false);
  });

  it('actual range がなければ false', () => {
    const entry = {
      start_time: '2026-03-12T09:00:00Z',
      end_time: '2026-03-12T10:00:00Z',
    };
    expect(hasPlannedActualDiff(entry)).toBe(false);
  });
});
