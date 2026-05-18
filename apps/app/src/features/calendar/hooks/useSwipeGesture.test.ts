import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSwipeGesture } from './useSwipeGesture';

describe('useSwipeGesture', () => {
  let matchMediaMock: { matches: boolean };

  beforeEach(() => {
    matchMediaMock = { matches: true };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => matchMediaMock),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const createTouchEvent = (clientX: number, clientY: number) => ({
    touches: [{ clientX, clientY }],
    preventDefault: vi.fn(),
  });

  describe('スワイプ検出', () => {
    it('左スワイプでonSwipeLeftが呼ばれる', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();
      const { result } = renderHook(() => useSwipeGesture(onSwipeLeft, onSwipeRight));

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(200, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('右スワイプでonSwipeRightが呼ばれる', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();
      const { result } = renderHook(() => useSwipeGesture(onSwipeLeft, onSwipeRight));

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(200, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(200, 100) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('しきい値', () => {
    it('しきい値未満のスワイプは無視される', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture(onSwipeLeft, undefined, { threshold: 100 }),
      );

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(60, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(60, 100) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('カスタムしきい値が動作する', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture(onSwipeLeft, undefined, { threshold: 30 }),
      );

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(60, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(60, 100) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });
  });

  describe('垂直スクロール', () => {
    it('垂直移動が優勢な場合はスワイプをキャンセル', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() => useSwipeGesture(onSwipeLeft));

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      // 垂直方向に大きく移動
      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(50, 200) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(50, 200) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('directionRatio', () => {
    // ratio=1.2 に引き下げたことで、斜め水平スワイプでもスクロール抑止（preventDefault）が効く
    it('軽い斜めスワイプで preventDefault が呼ばれる（|dx|/|dy|≈1.25）', () => {
      const { result } = renderHook(() => useSwipeGesture(vi.fn(), undefined, { threshold: 30 }));

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      // dx=-40, dy=32 → |dx|/|dy|=1.25
      // 旧ratio=1.5: 40 > 32*1.5=48? No → preventDefault されず（ページがスクロール）
      // 新ratio=1.2: 40 > 32*1.2=38.4? Yes → preventDefault される
      const moveEvent = createTouchEvent(60, 132);
      act(() => {
        result.current.handlers.onTouchMove(moveEvent as unknown as React.TouchEvent);
      });

      expect(moveEvent.preventDefault).toHaveBeenCalled();
    });

    // ratio=1.2 に引き下げたことで、軽い垂直優勢でも早めにスワイプをキャンセルする
    it('軽い垂直優勢（|dy|/|dx|=1.3）でスワイプがキャンセルされる', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture(onSwipeLeft, undefined, { threshold: 30 }),
      );

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      // dx=-40, dy=52 → |dy|/|dx|=1.3
      // 旧ratio=1.5: 52 > 40*1.5=60? No → キャンセルされず発火
      // 新ratio=1.2: 52 > 40*1.2=48? Yes → キャンセルされ発火しない
      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(60, 152) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(60, 152) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('無効化', () => {
    it('disabled=trueでスワイプが無効になる', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture(onSwipeLeft, undefined, { disabled: true }),
      );

      act(() => {
        result.current.handlers.onTouchStart(
          createTouchEvent(200, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchMove(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      act(() => {
        result.current.handlers.onTouchEnd(
          createTouchEvent(100, 100) as unknown as React.TouchEvent,
        );
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('refとhandlers', () => {
    it('handlersオブジェクトが返される', () => {
      const { result } = renderHook(() => useSwipeGesture());

      expect(result.current.handlers).toBeDefined();
      expect(result.current.handlers.onTouchStart).toBeInstanceOf(Function);
      expect(result.current.handlers.onTouchMove).toBeInstanceOf(Function);
      expect(result.current.handlers.onTouchEnd).toBeInstanceOf(Function);
    });

    it('refが返される', () => {
      const { result } = renderHook(() => useSwipeGesture());

      expect(result.current.ref).toBeDefined();
      expect(result.current.ref.current).toBeNull();
    });
  });
});
