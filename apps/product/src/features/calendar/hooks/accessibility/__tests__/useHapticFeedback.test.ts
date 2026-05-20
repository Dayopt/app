import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// useReducedMotionの結果をモック
let mockReducedMotion = false;
vi.mock('../useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { useHapticFeedback } from '../useHapticFeedback';

describe('useHapticFeedback', () => {
  const originalVibrate = navigator.vibrate;

  beforeEach(() => {
    mockReducedMotion = false;
    // navigator.vibrateをモック
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', {
      value: originalVibrate,
      writable: true,
      configurable: true,
    });
  });

  describe('isSupported', () => {
    it('Vibration APIが利用可能な場合はtrue', () => {
      const { result } = renderHook(() => useHapticFeedback());
      expect(result.current.isSupported).toBe(true);
    });

    it('reduced motionの場合はfalse', () => {
      mockReducedMotion = true;
      const { result } = renderHook(() => useHapticFeedback());
      expect(result.current.isSupported).toBe(false);
    });
  });

  describe('振動パターン', () => {
    it('tapは10msの軽い振動', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.tap();
      expect(navigator.vibrate).toHaveBeenCalledWith(10);
    });

    it('successはダブルパターン振動', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.success();
      expect(navigator.vibrate).toHaveBeenCalledWith([50, 30, 50]);
    });

    it('errorは強めのダブルパターン振動', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.error();
      expect(navigator.vibrate).toHaveBeenCalledWith([100, 50, 100]);
    });

    it('selectionは15msの振動', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.selection();
      expect(navigator.vibrate).toHaveBeenCalledWith(15);
    });

    it('impactは30msの振動', () => {
      const { result } = renderHook(() => useHapticFeedback());
      result.current.impact();
      expect(navigator.vibrate).toHaveBeenCalledWith(30);
    });
  });

  describe('reduced motion時', () => {
    it('全ての振動メソッドが無効化される', () => {
      mockReducedMotion = true;
      const { result } = renderHook(() => useHapticFeedback());

      result.current.tap();
      result.current.success();
      result.current.error();
      result.current.selection();
      result.current.impact();

      expect(navigator.vibrate).not.toHaveBeenCalled();
    });
  });
});
