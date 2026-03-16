import { describe, expect, it } from 'vitest';

import {
  calculateGridHeight,
  calculateScrollPosition,
  getDurationInMinutes,
  getEventStyle,
  isTimeInRange,
  pixelsToTime,
  pixelsToTimeValues,
  roundToQuarterHour,
  timeToPixels,
} from '../grid';

describe('timeToPixels', () => {
  it('0:00を0pxに変換する', () => {
    const time = new Date('2026-01-15T00:00:00');
    expect(timeToPixels(time, 72)).toBe(0);
  });

  it('1:00をhourHeight pxに変換する', () => {
    const time = new Date('2026-01-15T01:00:00');
    expect(timeToPixels(time, 72)).toBe(72);
  });

  it('12:00を正しく変換する', () => {
    const time = new Date('2026-01-15T12:00:00');
    expect(timeToPixels(time, 72)).toBe(864); // 12 * 72
  });

  it('1:30を正しく変換する', () => {
    const time = new Date('2026-01-15T01:30:00');
    expect(timeToPixels(time, 60)).toBe(90); // 90分 * 60 / 60
  });

  it('カスタムhourHeightで計算できる', () => {
    const time = new Date('2026-01-15T02:00:00');
    expect(timeToPixels(time, 48)).toBe(96); // 2 * 48
  });
});

describe('pixelsToTime', () => {
  const baseDate = new Date('2026-01-15T00:00:00');

  it('0pxを0:00に変換する', () => {
    const result = pixelsToTime(0, baseDate, 72);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('72pxを1:00に変換する（hourHeight=72）', () => {
    const result = pixelsToTime(72, baseDate, 72);
    expect(result.getHours()).toBe(1);
    expect(result.getMinutes()).toBe(0);
  });

  it('36pxを0:30に変換する（hourHeight=72）', () => {
    const result = pixelsToTime(36, baseDate, 72);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(30);
  });

  it('baseDateの日付を保持する', () => {
    const result = pixelsToTime(72, baseDate, 72);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it('秒とミリ秒を0にリセットする', () => {
    const result = pixelsToTime(100, baseDate, 72);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe('pixelsToTimeValues', () => {
  it('0pxを0時0分に変換する', () => {
    const result = pixelsToTimeValues(0, 72);
    expect(result).toEqual({ hour: 0, minute: 0 });
  });

  it('72pxを1時0分に変換する', () => {
    const result = pixelsToTimeValues(72, 72);
    expect(result).toEqual({ hour: 1, minute: 0 });
  });

  it('36pxを0時30分に変換する', () => {
    const result = pixelsToTimeValues(36, 72);
    expect(result).toEqual({ hour: 0, minute: 30 });
  });

  it('864pxを12時0分に変換する（hourHeight=72）', () => {
    const result = pixelsToTimeValues(864, 72);
    expect(result).toEqual({ hour: 12, minute: 0 });
  });
});

describe('getEventStyle', () => {
  it('基本的なスタイルを返す', () => {
    const start = new Date('2026-01-15T10:00:00');
    const end = new Date('2026-01-15T11:00:00');
    const style = getEventStyle(start, end, 0, 1, 72);

    expect(style.position).toBe('absolute');
    expect(style.top).toBe('720px'); // 10 * 72
    expect(style.height).toBe('72px'); // 1時間分
    expect(style.left).toBe('0%');
    expect(style.width).toBe('100%');
    expect(style.zIndex).toBe(10);
  });

  it('複数カラムの場合、幅と位置が調整される', () => {
    const start = new Date('2026-01-15T10:00:00');
    const end = new Date('2026-01-15T11:00:00');
    const style = getEventStyle(start, end, 1, 3, 72);

    // width = 100 / 3 ≈ 33.33%
    expect(parseFloat(style.width as string)).toBeCloseTo(33.33, 1);
    // left = (100 / 3) * 1 ≈ 33.33%
    expect(parseFloat(style.left as string)).toBeCloseTo(33.33, 1);
  });

  it('最小高さ20pxが保証される', () => {
    const start = new Date('2026-01-15T10:00:00');
    const end = new Date('2026-01-15T10:05:00'); // 5分 = 6px (< 20px)
    const style = getEventStyle(start, end, 0, 1, 72);

    expect(style.height).toBe('20px');
  });
});

describe('calculateGridHeight', () => {
  it('0-24時の高さを計算する', () => {
    expect(calculateGridHeight(0, 24, 72)).toBe(1728); // 24 * 72
  });

  it('8-18時の高さを計算する', () => {
    expect(calculateGridHeight(8, 18, 72)).toBe(720); // 10 * 72
  });

  it('デフォルトで0-24時を使用する', () => {
    expect(calculateGridHeight(undefined, undefined, 72)).toBe(1728);
  });
});

describe('isTimeInRange', () => {
  it('範囲内の時刻はtrueを返す', () => {
    const time = new Date('2026-01-15T12:00:00');
    expect(isTimeInRange(time, 8, 18)).toBe(true);
  });

  it('開始時間ちょうどはtrueを返す', () => {
    const time = new Date('2026-01-15T08:00:00');
    expect(isTimeInRange(time, 8, 18)).toBe(true);
  });

  it('終了時間ちょうどはfalseを返す（排他的上限）', () => {
    const time = new Date('2026-01-15T18:00:00');
    expect(isTimeInRange(time, 8, 18)).toBe(false);
  });

  it('範囲外の時刻はfalseを返す', () => {
    const time = new Date('2026-01-15T06:00:00');
    expect(isTimeInRange(time, 8, 18)).toBe(false);
  });
});

describe('roundToQuarterHour', () => {
  describe('direction = "nearest"', () => {
    it('7分を0分に丸める', () => {
      const time = new Date('2026-01-15T10:07:00');
      const result = roundToQuarterHour(time, 'nearest');
      expect(result.getMinutes()).toBe(0);
    });

    it('8分を15分に丸める', () => {
      const time = new Date('2026-01-15T10:08:00');
      const result = roundToQuarterHour(time, 'nearest');
      expect(result.getMinutes()).toBe(15);
    });

    it('15分はそのまま', () => {
      const time = new Date('2026-01-15T10:15:00');
      const result = roundToQuarterHour(time, 'nearest');
      expect(result.getMinutes()).toBe(15);
    });
  });

  describe('direction = "up"', () => {
    it('1分を15分に切り上げる', () => {
      const time = new Date('2026-01-15T10:01:00');
      const result = roundToQuarterHour(time, 'up');
      expect(result.getMinutes()).toBe(15);
    });

    it('0分はそのまま', () => {
      const time = new Date('2026-01-15T10:00:00');
      const result = roundToQuarterHour(time, 'up');
      expect(result.getMinutes()).toBe(0);
    });

    it('46分を次の時間の0分に切り上げる', () => {
      const time = new Date('2026-01-15T10:46:00');
      const result = roundToQuarterHour(time, 'up');
      expect(result.getHours()).toBe(11);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('direction = "down"', () => {
    it('14分を0分に切り下げる', () => {
      const time = new Date('2026-01-15T10:14:00');
      const result = roundToQuarterHour(time, 'down');
      expect(result.getMinutes()).toBe(0);
    });

    it('29分を15分に切り下げる', () => {
      const time = new Date('2026-01-15T10:29:00');
      const result = roundToQuarterHour(time, 'down');
      expect(result.getMinutes()).toBe(15);
    });

    it('45分はそのまま', () => {
      const time = new Date('2026-01-15T10:45:00');
      const result = roundToQuarterHour(time, 'down');
      expect(result.getMinutes()).toBe(45);
    });
  });

  it('秒とミリ秒を0にリセットする', () => {
    const time = new Date('2026-01-15T10:07:35.123');
    const result = roundToQuarterHour(time);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('元のDateを変更しない', () => {
    const time = new Date('2026-01-15T10:07:00');
    const originalMinutes = time.getMinutes();
    roundToQuarterHour(time);
    expect(time.getMinutes()).toBe(originalMinutes);
  });
});

describe('getDurationInMinutes', () => {
  it('1時間の差を60分として返す', () => {
    const start = new Date('2026-01-15T10:00:00');
    const end = new Date('2026-01-15T11:00:00');
    expect(getDurationInMinutes(start, end)).toBe(60);
  });

  it('30分の差を正しく返す', () => {
    const start = new Date('2026-01-15T10:00:00');
    const end = new Date('2026-01-15T10:30:00');
    expect(getDurationInMinutes(start, end)).toBe(30);
  });

  it('startがendより後の場合0を返す', () => {
    const start = new Date('2026-01-15T11:00:00');
    const end = new Date('2026-01-15T10:00:00');
    expect(getDurationInMinutes(start, end)).toBe(0);
  });

  it('同じ時刻の場合0を返す', () => {
    const time = new Date('2026-01-15T10:00:00');
    expect(getDurationInMinutes(time, time)).toBe(0);
  });
});

describe('calculateScrollPosition', () => {
  it('ターゲット時間に基づくスクロール位置を返す', () => {
    const result = calculateScrollPosition(8, 72, 600);
    // 8 * 72 - 600 / 3 = 576 - 200 = 376
    expect(result).toBe(376);
  });

  it('負の値にならない（0以上）', () => {
    const result = calculateScrollPosition(0, 72, 600);
    expect(result).toBe(0);
  });

  it('小さなhourHeightでも動作する', () => {
    const result = calculateScrollPosition(8, 48, 600);
    // 8 * 48 - 600 / 3 = 384 - 200 = 184
    expect(result).toBe(184);
  });
});
