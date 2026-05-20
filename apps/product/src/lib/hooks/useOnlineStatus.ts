'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * ブラウザのオンライン/オフライン状態を監視するフック
 *
 * useSyncExternalStoreでSSR安全。SSR時はtrue（オンライン）を返す。
 */
export function useOnlineStatus(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);

  const getSnapshot = useCallback(() => navigator.onLine, []);

  const getServerSnapshot = useCallback(() => true, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
