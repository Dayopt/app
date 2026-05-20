import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// カレンダー設定ストアをモック
let mockDateFormat = 'yyyy-MM-dd';
let mockTimeFormat: '12h' | '24h' = '24h';
let mockTimezone = 'Asia/Tokyo';

vi.mock('@/lib/stores/useCalendarSettingsStore', () => ({
  useCalendarSettingsStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      dateFormat: mockDateFormat,
      timeFormat: mockTimeFormat,
      timezone: mockTimezone,
    };
    return selector ? selector(state) : state;
  },
}));

import { useDateFormat } from '@/lib/hooks/useDateFormat';

describe('useDateFormat', () => {
  const testDate = new Date('2026-02-21T14:30:00');

  beforeEach(() => {
    mockDateFormat = 'yyyy-MM-dd';
    mockTimeFormat = '24h';
    mockTimezone = 'Asia/Tokyo';
  });

  describe('formatDate', () => {
    it('yyyy-MM-dd形式でフォーマットする', () => {
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.formatDate(testDate)).toBe('2026-02-21');
    });

    it('設定に応じたフォーマットを使用する', () => {
      mockDateFormat = 'MM/dd/yyyy';
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.formatDate(testDate)).toBe('02/21/2026');
    });
  });

  describe('formatTime', () => {
    it('24h形式でフォーマットする', () => {
      mockTimeFormat = '24h';
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.formatTime(testDate)).toBe('14:30');
    });

    it('12h形式でフォーマットする', () => {
      mockTimeFormat = '12h';
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.formatTime(testDate)).toMatch(/2:30 PM/i);
    });
  });

  describe('formatDateTime', () => {
    it('24h形式で日付と時刻を結合する', () => {
      mockTimeFormat = '24h';
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.formatDateTime(testDate)).toBe('2026-02-21 14:30');
    });

    it('12h形式で日付と時刻を結合する', () => {
      mockTimeFormat = '12h';
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.formatDateTime(testDate)).toMatch(/2026-02-21 2:30 PM/i);
    });
  });

  describe('設定値の返却', () => {
    it('現在の設定値が返される', () => {
      const { result } = renderHook(() => useDateFormat());
      expect(result.current.dateFormat).toBe('yyyy-MM-dd');
      expect(result.current.timeFormat).toBe('24h');
      expect(result.current.timezone).toBe('Asia/Tokyo');
    });
  });
});
