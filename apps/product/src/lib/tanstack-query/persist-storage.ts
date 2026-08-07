/**
 * TanStack Query キャッシュ永続化ストレージ（IndexedDB）
 *
 * タブを閉じて再度開いた際にキャッシュデータを即座に復元し、
 * バックグラウンドで最新データを再フェッチするためのストレージアダプター。
 *
 * @design
 * - IndexedDB を使用（5MB制限のある localStorage より大容量）
 * - データは単一 blob としてシリアライズ（tRPCと同じ superjson を使用）
 * - SSR 環境では no-op として動作（IndexedDB は Window API）
 * - バージョンバスター: APP_VERSION でデプロイ時にキャッシュを自動破棄
 */

import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import superjson from 'superjson';

import { logger } from '@/lib/logger';

const DB_NAME = 'dayopt-query-cache';
const STORE_NAME = 'cache';
const CACHE_KEY = 'DAYOPT_QUERY_CLIENT';
const DB_VERSION = 1;

/** IndexedDB の接続を開いて返す */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/** IndexedDB から文字列値を取得 */
async function getItem(key: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = (event) => {
      const result = (event.target as IDBRequest<string | undefined>).result;
      resolve(result ?? null);
    };

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };

    tx.oncomplete = () => db.close();
  });
}

/** IndexedDB に文字列値を保存 */
async function setItem(key: string, value: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve();

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };

    tx.oncomplete = () => db.close();
  });
}

/** IndexedDB から値を削除 */
async function removeItem(key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * TanStack Query の Persister インターフェースを実装した IndexedDB ペルシスター
 *
 * `PersistQueryClientProvider` に渡す persister。
 * superjson で Date 型を含むデータも正確にシリアライズ/デシリアライズする。
 *
 * SSR 時（indexedDB が undefined）は全メソッドが no-op で動作する。
 *
 * @example
 * ```tsx
 * <PersistQueryClientProvider
 *   client={queryClient}
 *   persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE_MS }}
 * >
 * ```
 */
export const queryPersister: Persister = {
  persistClient: async (client: PersistedClient): Promise<void> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    try {
      await setItem(CACHE_KEY, superjson.stringify(client));
    } catch (error) {
      logger.warn('[QueryPersist] persistClient failed:', error);
    }
  },

  restoreClient: async (): Promise<PersistedClient | undefined> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return undefined;
    try {
      const serialized = await getItem(CACHE_KEY);
      if (!serialized) return undefined;
      return superjson.parse<PersistedClient>(serialized);
    } catch (error) {
      logger.warn('[QueryPersist] restoreClient failed:', error);
      return undefined;
    }
  },

  removeClient: async (): Promise<void> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return;
    try {
      await removeItem(CACHE_KEY);
    } catch (error) {
      logger.warn('[QueryPersist] removeClient failed:', error);
    }
  },
};

/**
 * キャッシュ永続化の最大保持期間
 *
 * QueryClient のデフォルト gcTime（`query-client.ts` の `gcTime: PERSIST_MAX_AGE_MS`）と同じ値。
 * QueryClient の gcTime がこの値以上である必要がある（GC 前に復元できるよう）。
 */
export const PERSIST_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2時間

/**
 * キャッシュバスターの文字列（リリースversion変更時に変わる）
 *
 * next.config.mjs でroot package.jsonのversionをNEXT_PUBLIC_APP_VERSIONとして注入済み。
 * リリースversionが変わるとキャッシュが自動的に破棄される。
 */
export const CACHE_BUSTER = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
