import { useSyncExternalStore } from 'react';

/**
 * SSR/ハイドレーション安全なマウント状態フック
 *
 * useSyncExternalStore を使い、サーバーでは false、クライアントでは true を返す。
 * useEffect + setState パターンの代替として、不要な再レンダリングを回避する。
 *
 * @see https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering
 */

function subscribe() {
  // マウント状態は変化しないので、購読は不要
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
