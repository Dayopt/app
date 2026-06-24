'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * メディアクエリの状態を監視するフック（React 18+ useSyncExternalStore 使用）
 * @param query CSSメディアクエリ文字列（例: '(max-width: 767px)'）
 * @returns クエリが一致する場合 true
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === 'undefined') {
        return () => {};
      }
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener('change', callback);
      return () => mediaQueryList.removeEventListener('change', callback);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
