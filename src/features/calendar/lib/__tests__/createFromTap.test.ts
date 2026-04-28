import { describe, expect, it } from 'vitest';

import {
  computeTapEntryTimeRange,
  DEFAULT_TAP_DURATION_MINUTES,
  extractDurationMinutes,
  inferTapDurationMinutes,
  modeOf,
} from '../createFromTap';

describe('modeOf', () => {
  it('単一の最頻値を返す', () => {
    expect(modeOf([1, 2, 2, 3])).toBe(2);
  });

  it('要素 1 件はそれを返す', () => {
    expect(modeOf([42])).toBe(42);
  });

  it('全要素同じならその値', () => {
    expect(modeOf([5, 5, 5])).toBe(5);
  });

  it('tie は最初に登場したものを優先する', () => {
    // 1 と 2 が各 2 回 → 先に登場した 1 が勝つ
    expect(modeOf([1, 2, 1, 2])).toBe(1);
    expect(modeOf([2, 1, 2, 1])).toBe(2);
  });

  it('空配列は null', () => {
    expect(modeOf([])).toBeNull();
  });

  it('文字列でも動く', () => {
    expect(modeOf(['a', 'b', 'a'])).toBe('a');
  });
});

describe('inferTapDurationMinutes', () => {
  it('履歴の最頻 duration を返す', () => {
    expect(inferTapDurationMinutes([30, 60, 30, 45])).toBe(30);
  });

  it('履歴ゼロは default 30 分', () => {
    expect(inferTapDurationMinutes([])).toBe(DEFAULT_TAP_DURATION_MINUTES);
    expect(DEFAULT_TAP_DURATION_MINUTES).toBe(30);
  });

  it('0 以下や非有限値は除外する', () => {
    expect(inferTapDurationMinutes([0, -10, NaN, Infinity, 60, 60])).toBe(60);
  });

  it('全要素が無効なら default にフォールバック', () => {
    expect(inferTapDurationMinutes([0, -5, NaN])).toBe(DEFAULT_TAP_DURATION_MINUTES);
  });
});

describe('computeTapEntryTimeRange', () => {
  it('start の秒・ms を 0 化、end は start + duration', () => {
    const now = new Date('2026-04-28T11:09:30.500Z');
    const { startISO, endISO } = computeTapEntryTimeRange(now, 30);
    expect(startISO).toBe('2026-04-28T11:09:00.000Z');
    expect(endISO).toBe('2026-04-28T11:39:00.000Z');
  });

  it('1 分粒度の分は保持される（11:09 のまま）', () => {
    const now = new Date('2026-04-28T11:09:00.000Z');
    const { startISO } = computeTapEntryTimeRange(now, 30);
    // 09 分が 00 や 15 に丸められないこと
    expect(startISO.endsWith('11:09:00.000Z')).toBe(true);
  });

  it('日跨ぎ: 23:50 + 30 分 = 翌日 00:20', () => {
    const now = new Date('2026-04-28T23:50:00.000Z');
    const { startISO, endISO } = computeTapEntryTimeRange(now, 30);
    expect(startISO).toBe('2026-04-28T23:50:00.000Z');
    expect(endISO).toBe('2026-04-29T00:20:00.000Z');
  });

  it('duration 1 分でも end は start + 1 分', () => {
    const now = new Date('2026-04-28T11:09:00.000Z');
    const { startISO, endISO } = computeTapEntryTimeRange(now, 1);
    expect(startISO).toBe('2026-04-28T11:09:00.000Z');
    expect(endISO).toBe('2026-04-28T11:10:00.000Z');
  });
});

describe('extractDurationMinutes', () => {
  it('start_time / end_time から duration を分単位で算出', () => {
    const entries = [
      { start_time: '2026-04-28T01:00:00Z', end_time: '2026-04-28T01:30:00Z' },
      { start_time: '2026-04-28T02:00:00Z', end_time: '2026-04-28T03:00:00Z' },
    ];
    expect(extractDurationMinutes(entries)).toEqual([30, 60]);
  });

  it('duration_minutes が指定されていればそれを優先する', () => {
    const entries = [
      {
        start_time: '2026-04-28T01:00:00Z',
        end_time: '2026-04-28T01:30:00Z',
        duration_minutes: 90,
      },
    ];
    expect(extractDurationMinutes(entries)).toEqual([90]);
  });

  it('start / end が欠落している entry は除外', () => {
    const entries = [
      { start_time: null, end_time: '2026-04-28T01:30:00Z' },
      { start_time: '2026-04-28T01:00:00Z', end_time: null },
      { start_time: '2026-04-28T01:00:00Z', end_time: '2026-04-28T01:30:00Z' },
    ];
    expect(extractDurationMinutes(entries)).toEqual([30]);
  });

  it('0 以下の duration は除外', () => {
    const entries = [
      { start_time: '2026-04-28T01:00:00Z', end_time: '2026-04-28T01:00:00Z' }, // 0 分
      { start_time: '2026-04-28T02:00:00Z', end_time: '2026-04-28T01:00:00Z' }, // 負
      { start_time: '2026-04-28T03:00:00Z', end_time: '2026-04-28T03:30:00Z' }, // 30 分
    ];
    expect(extractDurationMinutes(entries)).toEqual([30]);
  });
});
