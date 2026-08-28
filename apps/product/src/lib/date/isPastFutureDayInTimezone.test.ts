import { describe, expect, it } from 'vitest';

import { isFutureDayInTimezone, isPastDayInTimezone } from './timezone';

/**
 * isPastDayInTimezone / isFutureDayInTimezone のテスト（#2302）
 *
 * モバイルヘッダーの「今日」アイコンを Redo/Undo で出し分けるための
 * 前後判定。isTodayInTimezone と同じ TZ 境界の考え方で判定する。
 */
describe('isPastDayInTimezone / isFutureDayInTimezone', () => {
  it('今日は過去でも未来でもない', () => {
    const now = new Date('2026-04-29T09:00:00Z');
    expect(isPastDayInTimezone(now, 'Asia/Tokyo', now)).toBe(false);
    expect(isFutureDayInTimezone(now, 'Asia/Tokyo', now)).toBe(false);
  });

  it('過去日は isPastDayInTimezone だけ true', () => {
    const now = new Date('2026-04-29T09:00:00Z');
    const past = new Date('2026-04-27T09:00:00Z');

    expect(isPastDayInTimezone(past, 'Asia/Tokyo', now)).toBe(true);
    expect(isFutureDayInTimezone(past, 'Asia/Tokyo', now)).toBe(false);
  });

  it('未来日は isFutureDayInTimezone だけ true', () => {
    const now = new Date('2026-04-29T09:00:00Z');
    const future = new Date('2026-05-02T09:00:00Z');

    expect(isPastDayInTimezone(future, 'Asia/Tokyo', now)).toBe(false);
    expect(isFutureDayInTimezone(future, 'Asia/Tokyo', now)).toBe(true);
  });

  it('UTC 境界をまたぐ TZ でも暦日キー基準で判定する', () => {
    // UTC 2026-04-28 23:30 = JST 2026-04-29 08:30（今日は JST 29日）
    const now = new Date('2026-04-28T23:30:00Z');
    // UTC 2026-04-28 00:00 = JST 2026-04-28 09:00（JST では前日 = 過去）
    const utcMidnight = new Date('2026-04-28T00:00:00Z');

    expect(isPastDayInTimezone(utcMidnight, 'Asia/Tokyo', now)).toBe(true);
    expect(isFutureDayInTimezone(utcMidnight, 'Asia/Tokyo', now)).toBe(false);
  });
});
