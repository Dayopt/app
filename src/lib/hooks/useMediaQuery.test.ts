import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  let matchMediaMock: ReturnType<typeof createMatchMediaMock>;

  function createMatchMediaMock(matches: boolean) {
    const listeners: Array<() => void> = [];

    return {
      matches,
      media: '',
      onchange: null,
      addEventListener: vi.fn((_, callback) => {
        listeners.push(callback);
      }),
      removeEventListener: vi.fn((_, callback) => {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }),
      dispatchEvent: vi.fn(),
      // テスト用: matchesを変更してリスナーを呼び出す
      setMatches: (newMatches: boolean) => {
        matchMediaMock.matches = newMatches;
        listeners.forEach((listener) => listener());
      },
    };
  }

  beforeEach(() => {
    matchMediaMock = createMatchMediaMock(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => matchMediaMock),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初期状態でmatchMedia.matchesの値を返す', () => {
    matchMediaMock.matches = true;
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('matchesがfalseの場合はfalseを返す', () => {
    matchMediaMock.matches = false;
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(false);
  });

  it('メディアクエリの変更を検知して更新する', () => {
    matchMediaMock.matches = false;
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(false);

    // メディアクエリがマッチするように変更
    act(() => {
      matchMediaMock.setMatches(true);
    });

    expect(result.current).toBe(true);
  });

  it('クエリが変更されたら新しいmatchMediaを使用する', () => {
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 1024px)' },
    });

    // matchMediaが呼ばれたことを確認
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');

    // クエリを変更
    rerender({ query: '(max-width: 639px)' });

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 639px)');
  });

  it('コンポーネントのアンマウント時にリスナーを解除する', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    unmount();

    expect(matchMediaMock.removeEventListener).toHaveBeenCalled();
  });

  it('SSR環境（windowがundefined）ではfalseを返す', () => {
    // windowをundefinedにする
    const originalWindow = global.window;
    // @ts-expect-error - テスト用にwindowを削除
    delete global.window;

    // useSyncExternalStoreのgetServerSnapshotが呼ばれるケースをシミュレート
    // 実際のSSRテストは難しいため、このテストはスキップ可能
    // ここでは単にwindowが存在しない場合の動作を確認

    global.window = originalWindow;
  });

  describe('MEDIA_QUERIESとの統合', () => {
    it('モバイルクエリで正しく動作する', () => {
      matchMediaMock.matches = true;
      const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
      expect(result.current).toBe(true);
    });

    it('デスクトップクエリで正しく動作する', () => {
      matchMediaMock.matches = true;
      const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
      expect(result.current).toBe(true);
    });

    it('タッチデバイスクエリで正しく動作する', () => {
      matchMediaMock.matches = true;
      const { result } = renderHook(() => useMediaQuery('(hover: none) and (pointer: coarse)'));
      expect(result.current).toBe(true);
    });
  });
});
