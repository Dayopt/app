'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';

import type { SyncQueueEntry } from '@/lib/pwa/sync-queue';

// ---------------------------------------------------------------------------
// 外部ストア（同期キューの状態をReactiveに購読）
// ---------------------------------------------------------------------------

let currentEntries: SyncQueueEntry[] = [];
let storeListeners: Array<() => void> = [];

function getSnapshot(): SyncQueueEntry[] {
  return currentEntries;
}

function getServerSnapshot(): SyncQueueEntry[] {
  return [];
}

function subscribeToStore(callback: () => void): () => void {
  storeListeners.push(callback);
  return () => {
    storeListeners = storeListeners.filter((fn) => fn !== callback);
  };
}

function updateEntries(entries: SyncQueueEntry[]): void {
  currentEntries = entries;
  storeListeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SyncStatus {
  /** オンライン状態 */
  isOnline: boolean;
  /** 同期待ちのmutation数 */
  pendingCount: number;
  /** 失敗したmutation数 */
  failedCount: number;
  /** 全エントリ */
  entries: SyncQueueEntry[];
  /** 同期中か（pendingがあり、オンライン） */
  isSyncing: boolean;
  /** 失敗エントリをクリア */
  clearFailed: () => Promise<void>;
}

/**
 * 同期キューの状態をReactiveに取得するフック
 *
 * @example
 * ```tsx
 * const { isOnline, pendingCount, failedCount } = useSyncStatus()
 *
 * if (!isOnline && pendingCount > 0) {
 *   return <div>{pendingCount}件の変更が同期待ちです</div>
 * }
 * ```
 */
export function useSyncStatus(): SyncStatus {
  const isOnline = useOnlineStatus();
  const entries = useSyncExternalStore(subscribeToStore, getSnapshot, getServerSnapshot);

  // 同期キューの購読を動的にインポート（コード分割）
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { subscribe, getAll } = await import('@/lib/pwa/sync-queue');

      // 初期データ取得
      try {
        const initial = await getAll();
        updateEntries(initial);
      } catch {
        // IndexedDB未対応環境では無視
      }

      // 変更を購読
      cleanup = subscribe((newEntries) => {
        updateEntries(newEntries);
      });
    };

    init();
    return () => cleanup?.();
  }, []);

  const pendingCount = entries.filter(
    (e) => e.status === 'pending' || e.status === 'processing',
  ).length;
  const failedCount = entries.filter((e) => e.status === 'failed').length;

  const clearFailed = useCallback(async () => {
    const { clearCompleted } = await import('@/lib/pwa/sync-queue');
    await clearCompleted();
  }, []);

  return {
    isOnline,
    pendingCount,
    failedCount,
    entries,
    isSyncing: isOnline && pendingCount > 0,
    clearFailed,
  };
}
