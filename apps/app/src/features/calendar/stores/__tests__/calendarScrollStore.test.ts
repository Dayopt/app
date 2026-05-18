import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getScrollPosition, resetScrollPositions, setScrollPosition } from '../calendarScrollStore';

describe('calendarScrollStore', () => {
  beforeEach(() => {
    resetScrollPositions();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  });

  describe('getScrollPosition', () => {
    it('未設定のビューは0を返す', () => {
      expect(getScrollPosition('day')).toBe(0);
      expect(getScrollPosition('week')).toBe(0);
    });
  });

  describe('setScrollPosition', () => {
    it('スクロール位置を保存・取得できる', () => {
      setScrollPosition('day', 500);
      expect(getScrollPosition('day')).toBe(500);
    });

    it('ビューごとに独立して保存される', () => {
      setScrollPosition('day', 100);
      setScrollPosition('week', 300);
      expect(getScrollPosition('day')).toBe(100);
      expect(getScrollPosition('week')).toBe(300);
    });

    it('上書きできる', () => {
      setScrollPosition('day', 100);
      setScrollPosition('day', 200);
      expect(getScrollPosition('day')).toBe(200);
    });
  });

  describe('resetScrollPositions', () => {
    it('全ビューのスクロール位置をリセットする', () => {
      setScrollPosition('day', 100);
      setScrollPosition('week', 300);
      resetScrollPositions();
      expect(getScrollPosition('day')).toBe(0);
      expect(getScrollPosition('week')).toBe(0);
    });
  });
});
