import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractTrailingNumber,
  findTodayBoardIssue,
  jstDateString,
  jstDayRange,
  jstYesterdayString,
} from './lib.mjs';

describe('jstDateString', () => {
  it('JST の暦日を YYYY-MM-DD で返す（UTC 前日 15:30 = JST 当日 00:30）', () => {
    // 2026-08-23T15:30:00Z = 2026-08-24T00:30:00+09:00
    expect(jstDateString(new Date('2026-08-23T15:30:00Z'))).toBe('2026-08-24');
  });

  it('UTC と同じ暦日になるケースも正しく変換する', () => {
    // 2026-08-24T01:00:00Z = 2026-08-24T10:00:00+09:00
    expect(jstDateString(new Date('2026-08-24T01:00:00Z'))).toBe('2026-08-24');
  });
});

describe('jstYesterdayString', () => {
  it('JST 暦日の前日を返す', () => {
    // 2026-08-24T10:00:00+09:00 の前日は 2026-08-23
    expect(jstYesterdayString(new Date('2026-08-24T01:00:00Z'))).toBe('2026-08-23');
  });

  it('JST 日境界をまたぐ瞬間（UTC 前日 15:00 = JST 当日 00:00）でも正しい前日を返す', () => {
    // 2026-08-23T15:00:00Z = 2026-08-24T00:00:00+09:00 → 前日は 2026-08-23
    expect(jstYesterdayString(new Date('2026-08-23T15:00:00Z'))).toBe('2026-08-23');
  });

  it('月境界をまたいでも正しい前日を返す', () => {
    // 2026-09-01T00:30:00+09:00 の前日は 2026-08-31
    expect(jstYesterdayString(new Date('2026-08-31T15:30:00Z'))).toBe('2026-08-31');
  });
});

describe('jstDayRange', () => {
  it('日境界レンジを組み立てる', () => {
    expect(jstDayRange('2026-08-24')).toBe('2026-08-24T00:00:00+09:00..2026-08-24T23:59:59+09:00');
  });
});

describe('extractTrailingNumber', () => {
  it('issue URL 末尾の番号を取り出す', () => {
    expect(extractTrailingNumber('https://github.com/Dayopt/dayopt/issues/2345\n')).toBe(2345);
  });

  it('comment URL（#issuecomment-ID 付き）でも issue 番号側を取り出す', () => {
    // gh issue comment の出力は https://.../issues/2345#issuecomment-999 形式。
    // 欲しいのは issue 番号（2345）で comment ID（999）ではない。
    expect(
      extractTrailingNumber('https://github.com/Dayopt/dayopt/issues/2345#issuecomment-999'),
    ).toBe(2345);
  });

  it('数字が無ければ null を返す', () => {
    expect(extractTrailingNumber('')).toBeNull();
  });
});

describe('findTodayBoardIssue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T01:00:00Z')); // JST 2026-08-24 10:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('本日タイトルの盤面 issue を返す', () => {
    const execFileImpl = vi.fn(() =>
      JSON.stringify([
        { number: 100, title: '盤面 2026-08-23' },
        { number: 200, title: '盤面 2026-08-24' },
      ]),
    );
    expect(findTodayBoardIssue({ execFileImpl })).toEqual({
      number: 200,
      title: '盤面 2026-08-24',
    });
  });

  it('見つからなければ null を返す', () => {
    const execFileImpl = vi.fn(() => JSON.stringify([]));
    expect(findTodayBoardIssue({ execFileImpl })).toBeNull();
  });
});
