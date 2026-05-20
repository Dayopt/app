/**
 * オフライン同期キュー
 *
 * IndexedDB にオフライン時のmutationを蓄積し、
 * オンライン復帰時に再送する。
 *
 * SW の Background Sync API と連携して
 * バックグラウンドでの再送もサポートする。
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 同期キューに蓄積するmutationエントリ */
export interface SyncQueueEntry {
  /** 一意ID（自動生成） */
  id: string;
  /** tRPCプロシージャパス（例: 'entries.create'） */
  procedure: string;
  /** リクエストボディ（JSON シリアライズ可能） */
  input: unknown;
  /** 作成日時（ISO文字列） */
  createdAt: string;
  /** リトライ回数 */
  retryCount: number;
  /** 最大リトライ回数 */
  maxRetries: number;
  /** ステータス */
  status: 'pending' | 'processing' | 'failed';
}

/** 同期キューのイベントリスナー */
type SyncQueueListener = (entries: SyncQueueEntry[]) => void;

// ---------------------------------------------------------------------------
// IndexedDB ヘルパー
// ---------------------------------------------------------------------------

const DB_NAME = 'dayopt-sync';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txPromise<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// SyncQueue
// ---------------------------------------------------------------------------

let listeners: SyncQueueListener[] = [];

function notifyListeners(entries: SyncQueueEntry[]): void {
  listeners.forEach((fn) => fn(entries));
}

/**
 * mutationをキューに追加
 */
export async function enqueue(
  procedure: string,
  input: unknown,
  maxRetries = 3,
): Promise<SyncQueueEntry> {
  const entry: SyncQueueEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    procedure,
    input,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries,
    status: 'pending',
  };

  const db = await openDB();
  await txPromise(db, STORE_NAME, 'readwrite', (store) => store.add(entry));
  db.close();

  logger.info('[SyncQueue] Enqueued:', procedure);

  // Background Sync をリクエスト（対応ブラウザのみ）
  await requestBackgroundSync();

  // リスナー通知
  const all = await getAll();
  notifyListeners(all);

  return entry;
}

/**
 * キュー内の全エントリを取得
 */
export async function getAll(): Promise<SyncQueueEntry[]> {
  const db = await openDB();
  const entries = await txPromise(db, STORE_NAME, 'readonly', (store) => store.getAll());
  db.close();
  return (entries as SyncQueueEntry[]).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * pending のエントリのみ取得
 */
export async function getPending(): Promise<SyncQueueEntry[]> {
  const all = await getAll();
  return all.filter((e) => e.status === 'pending');
}

/**
 * エントリのステータスを更新
 */
export async function updateEntry(
  id: string,
  update: Partial<Pick<SyncQueueEntry, 'status' | 'retryCount'>>,
): Promise<void> {
  const db = await openDB();
  const existing = await txPromise(db, STORE_NAME, 'readonly', (store) => store.get(id));

  if (!existing) {
    db.close();
    return;
  }

  const updated = { ...(existing as SyncQueueEntry), ...update };
  await txPromise(db, STORE_NAME, 'readwrite', (store) => store.put(updated));
  db.close();

  const all = await getAll();
  notifyListeners(all);
}

/**
 * エントリを削除
 */
export async function removeEntry(id: string): Promise<void> {
  const db = await openDB();
  await txPromise(db, STORE_NAME, 'readwrite', (store) => store.delete(id));
  db.close();

  const all = await getAll();
  notifyListeners(all);
}

/**
 * 処理済み・失敗済みエントリをクリア
 */
export async function clearCompleted(): Promise<void> {
  const all = await getAll();
  const toRemove = all.filter((e) => e.status === 'failed');

  if (toRemove.length === 0) return;

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  toRemove.forEach((e) => store.delete(e.id));

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  const remaining = await getAll();
  notifyListeners(remaining);
}

/**
 * キューの変更を購読
 */
export function subscribe(listener: SyncQueueListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((fn) => fn !== listener);
  };
}

/**
 * キュー内のpending件数を取得
 */
export async function getPendingCount(): Promise<number> {
  const pending = await getPending();
  return pending.length;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * エンティティIDを抽出する
 *
 * - `entries.*` / `tags.*` の update/delete: `input.id`
 * - その他: null（重複排除しない）
 */
function extractEntityId(procedure: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;

  const isEntriesOrTags = procedure.startsWith('entries.') || procedure.startsWith('tags.');
  if (!isEntriesOrTags) return null;

  const record = input as Record<string, unknown>;
  if (typeof record['id'] === 'string') return record['id'];

  return null;
}

/**
 * キュー内の重複mutationを圧縮する
 *
 * - `*.update` 同エンティティ: inputをマージ（後勝ち）、最新タイムスタンプを保持
 * - `*.delete` 同エンティティ: 先行する create/update を削除し、deleteのみ残す
 * - create → delete（同一tempID）: 両方を削除（net no-op）
 * - 重複排除不可のmutation: そのまま維持
 */
export async function deduplicateQueue(): Promise<void> {
  const all = await getAll();
  const pending = all.filter((e) => e.status === 'pending');

  if (pending.length <= 1) return;

  // エンティティキー（procedure種別 + entityId）ごとにグループ化
  // 重複排除対象外はそのまま残す
  type GroupKey = string;
  const groups = new Map<GroupKey, SyncQueueEntry[]>();
  const ungrouped: SyncQueueEntry[] = [];

  for (const entry of pending) {
    const entityId = extractEntityId(entry.procedure, entry.input);
    if (entityId === null) {
      ungrouped.push(entry);
      continue;
    }

    // 手続き名のリソース部分（例: 'entries'）を取得して汎用グループキーを作成
    const resource = entry.procedure.split('.')[0];
    const key: GroupKey = `${resource}::${entityId}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const toDelete: string[] = [];
  const toUpsert: SyncQueueEntry[] = [];

  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    // 時系列順（getAll()はすでにソート済みだが念のため）
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // group.length > 1 が保証されているので非nullアサーションは安全
    const lastEntry = group[group.length - 1]!;
    const lastOp = lastEntry.procedure.split('.').pop();

    if (lastOp === 'delete') {
      const firstEntry = group[0]!;
      const firstOp = firstEntry.procedure.split('.').pop();

      if (firstOp === 'create' && group.length === 2) {
        // create → delete: 両方削除（net no-op）
        toDelete.push(...group.map((e) => e.id));
        logger.info(`[SyncQueue] Dedup: removed create+delete no-op for ${lastEntry.procedure}`);
      } else {
        // create/update → delete: 先行エントリをすべて削除してdeleteのみ残す
        const preceding = group.slice(0, -1);
        toDelete.push(...preceding.map((e) => e.id));
        logger.info(
          `[SyncQueue] Dedup: collapsed ${preceding.length} entries before delete for ${lastEntry.procedure}`,
        );
      }
    } else if (lastOp === 'update') {
      // 複数のupdateをマージ（後勝ち）
      const updateEntries = group.filter((e) => e.procedure.split('.').pop() === 'update');

      if (updateEntries.length > 1) {
        const merged = updateEntries.reduce<Record<string, unknown>>((acc, e) => {
          if (typeof e.input === 'object' && e.input !== null) {
            return { ...acc, ...(e.input as Record<string, unknown>) };
          }
          return acc;
        }, {});

        const mergedEntry: SyncQueueEntry = {
          id: lastEntry.id,
          procedure: lastEntry.procedure,
          retryCount: lastEntry.retryCount,
          maxRetries: lastEntry.maxRetries,
          status: lastEntry.status,
          createdAt: lastEntry.createdAt,
          input: merged,
        };

        // 先行するupdateを削除して、マージ済みエントリを保存
        const preceding = updateEntries.slice(0, -1);
        toDelete.push(...preceding.map((e) => e.id));
        toUpsert.push(mergedEntry);

        logger.info(
          `[SyncQueue] Dedup: merged ${updateEntries.length} updates for ${lastEntry.procedure}`,
        );
      }
    }
  }

  if (toDelete.length === 0 && toUpsert.length === 0) return;

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const id of toDelete) {
    store.delete(id);
  }
  for (const entry of toUpsert) {
    store.put(entry);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  const remaining = await getAll();
  notifyListeners(remaining);

  logger.info(`[SyncQueue] Dedup complete: removed ${toDelete.length - toUpsert.length} entries`);
}

// ---------------------------------------------------------------------------
// Background Sync 連携
// ---------------------------------------------------------------------------

async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Background Sync API の存在確ェック
    if ('sync' in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register('dayopt-sync-mutations');
      logger.info('[SyncQueue] Background sync registered');
    }
  } catch (error) {
    // Background Sync 非対応ブラウザでは無視
    logger.warn('[SyncQueue] Background sync not available:', error);
  }
}
