import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useContainerHeight } from './useContainerHeight';

describe('useContainerHeight', () => {
  it('ref が未マウントの間は 0 を返す', () => {
    const ref = { current: null };
    const { result } = renderHook(() => useContainerHeight(ref));

    expect(result.current).toBe(0);
  });

  it('マウント済み要素の clientHeight を初期値として返す', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 1200 });
    document.body.append(el);
    const ref = { current: el };

    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    const OriginalResizeObserver = globalThis.ResizeObserver;
    class MockResizeObserver {
      observe = observeSpy;
      disconnect = disconnectSpy;
      unobserve = vi.fn();
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    const { result, unmount } = renderHook(() => useContainerHeight(ref));

    expect(result.current).toBe(1200);
    expect(observeSpy).toHaveBeenCalledWith(el);

    unmount();
    expect(disconnectSpy).toHaveBeenCalled();

    globalThis.ResizeObserver = OriginalResizeObserver;
    el.remove();
  });
});
