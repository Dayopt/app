import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrentTime } from '../useCurrentTime';

describe('useCurrentTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初期値として現在時刻を返す', () => {
    const now = new Date('2026-02-21T10:00:00Z');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useCurrentTime());

    expect(result.current.getTime()).toBe(now.getTime());
  });

  it('デフォルトでは1分間隔で更新される', () => {
    const startTime = new Date('2026-02-21T10:00:00Z');
    vi.setSystemTime(startTime);

    const { result } = renderHook(() => useCurrentTime());

    const initialTime = result.current.getTime();

    // 1分経過
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current.getTime()).toBeGreaterThan(initialTime);
  });

  it('カスタム更新間隔を指定できる', () => {
    const startTime = new Date('2026-02-21T10:00:00Z');
    vi.setSystemTime(startTime);

    const { result } = renderHook(() => useCurrentTime({ updateInterval: 5000 }));

    const initialTime = result.current.getTime();

    // 5秒経過
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.getTime()).toBeGreaterThan(initialTime);
  });

  it('enabled=falseの場合は更新されない', () => {
    const startTime = new Date('2026-02-21T10:00:00Z');
    vi.setSystemTime(startTime);

    const { result } = renderHook(() => useCurrentTime({ enabled: false }));

    const initialTime = result.current.getTime();

    // 時間経過
    act(() => {
      vi.advanceTimersByTime(120000);
    });

    expect(result.current.getTime()).toBe(initialTime);
  });

  it('アンマウント時にインターバルがクリアされる', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => useCurrentTime());
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
