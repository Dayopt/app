import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  let mockMatchMedia: ReturnType<typeof createMockMatchMedia>;
  let changeHandler: ((event: MediaQueryListEvent) => void) | null = null;

  function createMockMatchMedia(matches: boolean) {
    const mock = {
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          changeHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    return mock;
  }

  beforeEach(() => {
    changeHandler = null;
    mockMatchMedia = createMockMatchMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mockMatchMedia),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初期値はmatchMediaの結果に基づく（reduced motion OFF）', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('reduced motionがONの場合trueを返す', () => {
    mockMatchMedia = createMockMatchMedia(true);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mockMatchMedia),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('メディアクエリの変更に反応する', () => {
    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);

    // useSyncExternalStore は callback 後に getSnapshot() を再評価するため
    // mockMatchMedia.matches も更新してからコールバックを呼ぶ
    act(() => {
      mockMatchMedia.matches = true;
      changeHandler?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });

  it('アンマウント時にリスナーが解除される', () => {
    const { unmount } = renderHook(() => useReducedMotion());

    unmount();

    expect(mockMatchMedia.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
