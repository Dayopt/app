import { useSyncExternalStore } from 'react';

/**
 * SSR/ハイドレーション安全なマウント状態フック
 *
 * useSyncExternalStore を使い、サーバーでは false、クライアントでは true を返す。
 */

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
