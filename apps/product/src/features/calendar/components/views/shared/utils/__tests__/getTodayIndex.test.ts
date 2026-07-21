import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTodayIndex } from '../dateHelpers';

/**
 * getTodayIndex の TZ 対応回帰テスト
 *
 * Bug 背景: 旧実装は `date.toDateString()` 比較（ブラウザ ローカル TZ）。
 * カレンダー設定の timezone と OS TZ が異なる場合に「今日」の列が
 * 1 ずれる事故が起きうるため、明示的に TZ を渡すと TZ 基準で判定する。
 */
describe('getTodayIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timezone を渡すとユーザー TZ で「今日」を判定する', () => {
    // 現在は UTC 2026-04-28 23:30 (JST 2026-04-29 08:30)
    vi.setSystemTime(new Date('2026-04-28T23:30:00Z'));

    const dates = [
      new Date('2026-04-28T00:00:00Z'), // JST 28日 09:00
      new Date('2026-04-29T00:00:00Z'), // JST 29日 09:00 ← 今日
      new Date('2026-04-30T00:00:00Z'), // JST 30日 09:00
    ];

    expect(getTodayIndex(dates, 'Asia/Tokyo')).toBe(1);
    // UTC 基準では index 0 が今日（28日）
    expect(getTodayIndex(dates, 'UTC')).toBe(0);
  });

  it('対象配列に「今日」が含まれない場合 -1 を返す', () => {
    vi.setSystemTime(new Date('2026-04-28T12:00:00Z'));

    const dates = [
      new Date('2026-04-25T00:00:00Z'),
      new Date('2026-04-26T00:00:00Z'),
      new Date('2026-04-27T00:00:00Z'),
    ];

    expect(getTodayIndex(dates, 'Asia/Tokyo')).toBe(-1);
    expect(getTodayIndex(dates)).toBe(-1);
  });

  it('timezone 未指定はブラウザ TZ にフォールバック (互換挙動)', () => {
    // どの TZ で動くかは vitest 環境依存だが、 toDateString 比較で動くことだけを確認
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    expect(getTodayIndex([today])).toBe(0);
    expect(getTodayIndex([yesterday])).toBe(-1);
  });
});
