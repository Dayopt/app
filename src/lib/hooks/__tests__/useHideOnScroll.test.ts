import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHideOnScroll } from '../useHideOnScroll';

// rAF を同期実行にする
let rafCallback: FrameRequestCallback | null = null;
function flushRAF() {
  if (rafCallback) {
    rafCallback(0);
    rafCallback = null;
  }
}

function simulateWindowScroll(scrollY: number) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  document.dispatchEvent(new Event('scroll', { bubbles: false }));
  flushRAF();
}

function simulateElementScroll(el: Element, scrollTop: number) {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
  el.dispatchEvent(new Event('scroll', { bubbles: false }));
  flushRAF();
}

describe('useHideOnScroll', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 0,
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rafCallback = null;
  });

  it('初期状態は hidden = false', () => {
    const { result } = renderHook(() => useHideOnScroll());
    expect(result.current.hidden).toBe(false);
  });

  it('10px 超のダウンスクロールで hidden になる', () => {
    const { result } = renderHook(() => useHideOnScroll());
    act(() => simulateWindowScroll(12));
    expect(result.current.hidden).toBe(true);
  });

  it('9px のダウンスクロールでは hidden にならない（threshold 未満）', () => {
    const { result } = renderHook(() => useHideOnScroll());
    act(() => simulateWindowScroll(9));
    expect(result.current.hidden).toBe(false);
  });

  it('hidden 後に UP スクロールで visible に戻る', () => {
    const { result } = renderHook(() => useHideOnScroll());
    act(() => simulateWindowScroll(100));
    expect(result.current.hidden).toBe(true);

    act(() => simulateWindowScroll(80));
    expect(result.current.hidden).toBe(false);
  });

  it('scrollTop <= TOP_THRESHOLD(4) では常に visible', () => {
    const { result } = renderHook(() => useHideOnScroll());
    act(() => simulateWindowScroll(100));
    expect(result.current.hidden).toBe(true);

    act(() => simulateWindowScroll(3));
    expect(result.current.hidden).toBe(false);
  });

  it('reset() が hidden を false に戻す', () => {
    const { result } = renderHook(() => useHideOnScroll());
    act(() => simulateWindowScroll(100));
    expect(result.current.hidden).toBe(true);

    act(() => result.current.reset());
    expect(result.current.hidden).toBe(false);
  });

  it('要素スクロールで hidden になる', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

    const { result } = renderHook(() => useHideOnScroll());
    act(() => simulateElementScroll(el, 50));
    expect(result.current.hidden).toBe(true);

    el.remove();
  });

  it('水平スクロール（scrollTop 変化なし）では hidden にならない', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true });

    const { result } = renderHook(() => useHideOnScroll());

    // scrollTop は 0 のまま、イベントだけ発火
    act(() => {
      el.dispatchEvent(new Event('scroll', { bubbles: false }));
      flushRAF();
    });

    expect(result.current.hidden).toBe(false);
    el.remove();
  });

  it('アンマウント時にリスナーが解除される', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useHideOnScroll());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.objectContaining({ capture: true }),
    );
  });

  it('方向転換で accumulator がリセットされ、再度 threshold を超えるまで反応しない', () => {
    const { result } = renderHook(() => useHideOnScroll());

    // 下に大きくスクロール → hidden
    act(() => simulateWindowScroll(100));
    expect(result.current.hidden).toBe(true);

    // 少しだけ上（5px）→ threshold 未満なので hidden のまま
    act(() => simulateWindowScroll(95));
    expect(result.current.hidden).toBe(true);

    // さらに上（合計 15px）→ threshold 超え → visible
    act(() => simulateWindowScroll(85));
    expect(result.current.hidden).toBe(false);
  });
});
