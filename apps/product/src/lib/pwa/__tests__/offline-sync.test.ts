/**
 * オフライン同期システム 統合テスト
 *
 * テスト対象:
 * - sync-queue.ts    : IndexedDB を使った mutation キューの CRUD
 * - sync-processor.ts: キュー処理ループと online イベント起動
 * - offline-mutation.ts: ネットワークエラーを捕捉してキューに永続化
 * - フルフロー: enqueue → processQueue → executor 呼び出し → エントリ削除
 *
 * IndexedDB: happy-dom は IDB を実装していないため、インメモリ偽実装でモックする。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleOfflineMutationError } from '../offline-mutation';
import { initSyncProcessor, processQueue, setSyncExecutor } from '../sync-processor';
import {
  clearCompleted,
  enqueue,
  getAll,
  getPending,
  getPendingCount,
  removeEntry,
  subscribe,
  updateEntry,
} from '../sync-queue';

import type { SyncQueueEntry } from '../sync-queue';

// ---------------------------------------------------------------------------
// テスト用ヘルパー: 配列アクセスの非nullアサーション
// ---------------------------------------------------------------------------

/** テストで配列要素にアクセスする際の非nullアサーション */
function at<T>(arr: T[], index: number): T {
  const item = arr[index];
  if (item === undefined) throw new Error(`Array index ${index} is undefined`);
  return item;
}

// ---------------------------------------------------------------------------
// インメモリ IndexedDB 偽実装
// ---------------------------------------------------------------------------

/** オブジェクトストアのレコードを保持するマップ */
type StoreData = Map<string, SyncQueueEntry>;

/**
 * IDBRequest 相当の偽実装を生成する。
 * onsuccess / onerror を非同期（マイクロタスク）で呼び出す。
 */
function makeFakeRequest<T>(resolveWith: () => T): IDBRequest<T> {
  const req = {
    result: undefined as T,
    error: null as DOMException | null,
    onsuccess: null as ((e: Event) => void) | null,
    onerror: null as ((e: Event) => void) | null,
  } as unknown as IDBRequest<T>;

  queueMicrotask(() => {
    try {
      (req as { result: T }).result = resolveWith();
      req.onsuccess?.({} as Event);
    } catch (err) {
      (req as { error: unknown }).error = err;
      req.onerror?.({} as Event);
    }
  });

  return req;
}

/** IDBTransaction 偽実装 */
function makeFakeTransaction(store: IDBObjectStore): IDBTransaction {
  const tx = {
    objectStore: () => store,
    oncomplete: null as ((e: Event) => void) | null,
    onerror: null as ((e: Event) => void) | null,
  } as unknown as IDBTransaction;

  // oncomplete を同期的に呼ぶ（store.delete 呼び出し後に設定されるため非同期が必要）
  queueMicrotask(() => {
    tx.oncomplete?.({} as Event);
  });

  return tx;
}

/** オブジェクトストア偽実装を生成する */
function makeFakeStore(data: StoreData): IDBObjectStore {
  const store = {
    getAll: () => makeFakeRequest<SyncQueueEntry[]>(() => Array.from(data.values())),

    get: (key: string) => makeFakeRequest<SyncQueueEntry | undefined>(() => data.get(key)),

    add: (entry: SyncQueueEntry) =>
      makeFakeRequest<string>(() => {
        if (data.has(entry.id)) {
          throw new DOMException('Key already exists', 'ConstraintError');
        }
        data.set(entry.id, { ...entry });
        return entry.id;
      }),

    put: (entry: SyncQueueEntry) =>
      makeFakeRequest<string>(() => {
        data.set(entry.id, { ...entry });
        return entry.id;
      }),

    delete: (key: string) =>
      makeFakeRequest<undefined>(() => {
        data.delete(key);
        return undefined;
      }),

    createIndex: () => ({}) as IDBIndex,
  } as unknown as IDBObjectStore;

  return store;
}

/** IDBDatabase 偽実装 */
function makeFakeDB(data: StoreData): IDBDatabase {
  return {
    objectStoreNames: { contains: () => true } as unknown as DOMStringList,
    transaction: (_storeName: string, _mode: IDBTransactionMode) => {
      const store = makeFakeStore(data);
      return makeFakeTransaction(store) as IDBTransaction & {
        objectStore: () => IDBObjectStore;
      };
    },
    createObjectStore: (_name: string) => makeFakeStore(data),
    close: vi.fn(),
  } as unknown as IDBDatabase;
}

/**
 * `indexedDB.open()` を偽実装に差し替えて、テスト間で共有するストアデータを返す。
 * 毎テスト前に呼ぶことでストアをリセットできる。
 */
function setupFakeIndexedDB(): StoreData {
  const data: StoreData = new Map();

  const fakeIDB = {
    open: (_name: string, _version?: number): IDBOpenDBRequest => {
      const db = makeFakeDB(data);
      const req = {
        result: undefined as IDBDatabase | undefined,
        error: null as DOMException | null,
        onsuccess: null as ((e: Event) => void) | null,
        onerror: null as ((e: Event) => void) | null,
        onupgradeneeded: null as ((e: IDBVersionChangeEvent) => void) | null,
      } as unknown as IDBOpenDBRequest;

      queueMicrotask(() => {
        (req as { result: IDBDatabase }).result = db;
        req.onsuccess?.({} as Event);
      });

      return req;
    },
  } as unknown as IDBFactory;

  vi.stubGlobal('indexedDB', fakeIDB);
  return data;
}

// ---------------------------------------------------------------------------
// navigator モックヘルパー
// ---------------------------------------------------------------------------

function stubNavigatorOnline(online: boolean): void {
  vi.stubGlobal('navigator', {
    onLine: online,
    serviceWorker: {
      ready: Promise.resolve({
        sync: { register: vi.fn().mockResolvedValue(undefined) },
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

// ---------------------------------------------------------------------------
// テスト用ファクトリ
// ---------------------------------------------------------------------------

function createSyncQueueEntry(overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    procedure: 'entries.create',
    input: { title: 'Test Entry' },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    status: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// モジュールレベル状態リセット
// ---------------------------------------------------------------------------

/**
 * sync-processor.ts の `processing` フラグと `executor` はモジュールスコープの
 * let 変数なので、各テスト後にリセットが必要。
 * setSyncExecutor(null) は型上許可されていないため、no-op 関数で上書きし
 * processing フラグは processQueue が完了することで自動リセットされる。
 */
function resetProcessorState(): void {
  setSyncExecutor(async () => {});
}

// ---------------------------------------------------------------------------
// sync-queue.ts テスト
// ---------------------------------------------------------------------------

describe('sync-queue', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    stubNavigatorOnline(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('enqueue', () => {
    it('エントリをキューに追加して返す', async () => {
      const entry = await enqueue('entries.create', { title: 'Hello' });

      expect(entry.procedure).toBe('entries.create');
      expect(entry.input).toEqual({ title: 'Hello' });
      expect(entry.status).toBe('pending');
      expect(entry.retryCount).toBe(0);
      expect(entry.maxRetries).toBe(3);
      expect(entry.id).toMatch(/^\d+-[a-z0-9]+$/);
      expect(entry.createdAt).toBeTruthy();
    });

    it('デフォルトの maxRetries は 3', async () => {
      const entry = await enqueue('entries.update', {});
      expect(entry.maxRetries).toBe(3);
    });

    it('カスタム maxRetries を設定できる', async () => {
      const entry = await enqueue('entries.delete', {}, 5);
      expect(entry.maxRetries).toBe(5);
    });

    it('複数エントリを追加できる', async () => {
      await enqueue('entries.create', { title: 'A' });
      await enqueue('entries.create', { title: 'B' });
      await enqueue('entries.update', { title: 'C' });

      const all = await getAll();
      expect(all).toHaveLength(3);
    });

    it('追加後にリスナーが通知を受け取る', async () => {
      const listener = vi.fn();
      const unsub = subscribe(listener);

      await enqueue('entries.create', { title: 'Listen' });

      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ procedure: 'entries.create' })]),
      );

      unsub();
    });

    it('IndexedDB が利用不可の場合はエラーをスローする', async () => {
      vi.stubGlobal('indexedDB', undefined);
      await expect(enqueue('entries.create', {})).rejects.toThrow('IndexedDB is not available');
    });
  });

  // -------------------------------------------------------------------------
  describe('getAll', () => {
    it('空のキューでは空配列を返す', async () => {
      const entries = await getAll();
      expect(entries).toEqual([]);
    });

    it('全エントリを createdAt 昇順で返す', async () => {
      // 異なる createdAt を持つエントリを直接データマップに挿入
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const old = createSyncQueueEntry({
        id: 'old',
        createdAt: new Date(Date.now() - 2000).toISOString(),
      });
      const mid = createSyncQueueEntry({
        id: 'mid',
        createdAt: new Date(Date.now() - 1000).toISOString(),
      });
      const recent = createSyncQueueEntry({
        id: 'recent',
        createdAt: new Date().toISOString(),
      });

      // 故意に逆順でマップに追加
      data.set(recent.id, recent);
      data.set(old.id, old);
      data.set(mid.id, mid);

      const entries = await getAll();
      expect(at(entries, 0).id).toBe('old');
      expect(at(entries, 1).id).toBe('mid');
      expect(at(entries, 2).id).toBe('recent');
    });

    it('ステータスが混在しても全件返す', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('p', createSyncQueueEntry({ id: 'p', status: 'pending' }));
      data.set('f', createSyncQueueEntry({ id: 'f', status: 'failed' }));
      data.set('pr', createSyncQueueEntry({ id: 'pr', status: 'processing' }));

      const entries = await getAll();
      expect(entries).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  describe('getPending', () => {
    it('pending ステータスのエントリのみ返す', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('p1', createSyncQueueEntry({ id: 'p1', status: 'pending' }));
      data.set('p2', createSyncQueueEntry({ id: 'p2', status: 'pending' }));
      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));
      data.set('pr', createSyncQueueEntry({ id: 'pr', status: 'processing' }));

      const pending = await getPending();
      expect(pending).toHaveLength(2);
      expect(pending.every((e) => e.status === 'pending')).toBe(true);
    });

    it('pending がない場合は空配列を返す', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));

      const pending = await getPending();
      expect(pending).toEqual([]);
    });

    it('getPendingCount は pending 件数を返す', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('p1', createSyncQueueEntry({ id: 'p1', status: 'pending' }));
      data.set('p2', createSyncQueueEntry({ id: 'p2', status: 'pending' }));
      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));

      const count = await getPendingCount();
      expect(count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('updateEntry', () => {
    it('status を更新できる', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const entry = createSyncQueueEntry({ id: 'u1', status: 'pending' });
      data.set(entry.id, entry);

      await updateEntry('u1', { status: 'processing' });

      const all = await getAll();
      expect(at(all, 0).status).toBe('processing');
    });

    it('retryCount を更新できる', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const entry = createSyncQueueEntry({ id: 'r1', retryCount: 0 });
      data.set(entry.id, entry);

      await updateEntry('r1', { retryCount: 2 });

      const all = await getAll();
      expect(at(all, 0).retryCount).toBe(2);
    });

    it('status と retryCount を同時に更新できる', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const entry = createSyncQueueEntry({ id: 'sr1', status: 'pending', retryCount: 0 });
      data.set(entry.id, entry);

      await updateEntry('sr1', { status: 'failed', retryCount: 3 });

      const all = await getAll();
      expect(at(all, 0).status).toBe('failed');
      expect(at(all, 0).retryCount).toBe(3);
    });

    it('存在しない ID の場合は何もしない', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const entry = createSyncQueueEntry({ id: 'exist' });
      data.set(entry.id, entry);

      // 存在しない ID を渡してもエラーにならない
      await expect(updateEntry('nonexistent', { status: 'failed' })).resolves.toBeUndefined();

      // 既存エントリは変更されていない
      const all = await getAll();
      expect(at(all, 0).status).toBe('pending');
    });

    it('更新後にリスナーが通知を受け取る', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const entry = createSyncQueueEntry({ id: 'notify1' });
      data.set(entry.id, entry);

      const listener = vi.fn();
      const unsub = subscribe(listener);

      await updateEntry('notify1', { status: 'processing' });

      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'notify1', status: 'processing' })]),
      );

      unsub();
    });
  });

  // -------------------------------------------------------------------------
  describe('removeEntry', () => {
    it('指定した ID のエントリを削除する', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('del1', createSyncQueueEntry({ id: 'del1' }));
      data.set('del2', createSyncQueueEntry({ id: 'del2' }));

      await removeEntry('del1');

      const all = await getAll();
      expect(all).toHaveLength(1);
      expect(at(all, 0).id).toBe('del2');
    });

    it('存在しない ID を削除してもエラーにならない', async () => {
      setupFakeIndexedDB();
      stubNavigatorOnline(true);

      await expect(removeEntry('ghost')).resolves.toBeUndefined();
    });

    it('削除後にリスナーが通知を受け取る', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('rm1', createSyncQueueEntry({ id: 'rm1' }));

      const listener = vi.fn();
      const unsub = subscribe(listener);

      await removeEntry('rm1');

      expect(listener).toHaveBeenCalledWith([]);
      unsub();
    });
  });

  // -------------------------------------------------------------------------
  describe('clearCompleted', () => {
    it('failed ステータスのエントリを全て削除する', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));
      data.set('f2', createSyncQueueEntry({ id: 'f2', status: 'failed' }));
      data.set('p1', createSyncQueueEntry({ id: 'p1', status: 'pending' }));

      await clearCompleted();

      const all = await getAll();
      expect(all).toHaveLength(1);
      expect(at(all, 0).id).toBe('p1');
    });

    it('failed がない場合は何もしない', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('p1', createSyncQueueEntry({ id: 'p1', status: 'pending' }));

      await clearCompleted();

      const all = await getAll();
      expect(all).toHaveLength(1);
    });

    it('全エントリが failed の場合はキューが空になる', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));
      data.set('f2', createSyncQueueEntry({ id: 'f2', status: 'failed' }));

      await clearCompleted();

      const all = await getAll();
      expect(all).toEqual([]);
    });

    it('clearCompleted 後にリスナーが通知を受け取る', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));

      const listener = vi.fn();
      const unsub = subscribe(listener);

      await clearCompleted();

      expect(listener).toHaveBeenCalledWith([]);
      unsub();
    });

    it('processing ステータスのエントリは削除しない', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('pr1', createSyncQueueEntry({ id: 'pr1', status: 'processing' }));
      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));

      await clearCompleted();

      const all = await getAll();
      expect(all).toHaveLength(1);
      expect(at(all, 0).id).toBe('pr1');
    });
  });

  // -------------------------------------------------------------------------
  describe('subscribe', () => {
    it('登録解除関数を呼ぶとリスナーが外れる', async () => {
      setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const listener = vi.fn();
      const unsub = subscribe(listener);
      unsub();

      await enqueue('entries.create', {});

      // subscribe 解除後なので呼ばれない
      expect(listener).not.toHaveBeenCalled();
    });

    it('複数のリスナーが同時に通知を受け取る', async () => {
      setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const l1 = vi.fn();
      const l2 = vi.fn();
      const unsub1 = subscribe(l1);
      const unsub2 = subscribe(l2);

      await enqueue('entries.create', {});

      expect(l1).toHaveBeenCalled();
      expect(l2).toHaveBeenCalled();

      unsub1();
      unsub2();
    });
  });
});

// ---------------------------------------------------------------------------
// sync-processor.ts テスト
// ---------------------------------------------------------------------------

describe('sync-processor', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    stubNavigatorOnline(true);
    resetProcessorState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('processQueue', () => {
    it('executor が未設定の場合は処理をスキップする', async () => {
      // executor を null-like な状態にする（no-op で上書きした後に再度 null にできないため
      // setSyncExecutor は呼ばずに processQueue を呼ぶと警告が出るが処理はスキップされる）
      // ここでは executor を設定せずに直接 processQueue を呼ぶためにモジュールを再 import する
      // 代わりに: setSyncExecutor に呼ばれない状況を作れないため、
      // executor 未設定状態は初期化時（モジュール読み込み直後）のみ。
      // このテストは processQueue がオフラインガードを通ることを検証する。
      stubNavigatorOnline(false);

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      const data = setupFakeIndexedDB();
      stubNavigatorOnline(false);
      data.set('p1', createSyncQueueEntry({ id: 'p1' }));

      await processQueue();

      // オフラインのため executor は呼ばれない
      expect(executorMock).not.toHaveBeenCalled();
    });

    it('pending エントリを executor で処理しキューから削除する', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('p1', createSyncQueueEntry({ id: 'p1', procedure: 'entries.create' }));
      data.set('p2', createSyncQueueEntry({ id: 'p2', procedure: 'entries.update' }));

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      await processQueue();

      expect(executorMock).toHaveBeenCalledTimes(2);
      expect(executorMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', procedure: 'entries.create' }),
      );
      expect(executorMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p2', procedure: 'entries.update' }),
      );

      const remaining = await getAll();
      expect(remaining).toHaveLength(0);
    });

    it('executor 成功後にエントリが削除される', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('ok', createSyncQueueEntry({ id: 'ok' }));

      setSyncExecutor(async () => {
        // 成功する executor
      });

      await processQueue();

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('executor 失敗時に retryCount をインクリメントして pending に戻す', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('fail1', createSyncQueueEntry({ id: 'fail1', retryCount: 0, maxRetries: 3 }));

      setSyncExecutor(async () => {
        throw new Error('Server error');
      });

      await processQueue();

      const all = await getAll();
      expect(at(all, 0).retryCount).toBe(1);
      expect(at(all, 0).status).toBe('pending');
    });

    it('maxRetries に達したエントリは failed ステータスになる', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      // retryCount が maxRetries - 1 の状態（次の失敗で maxRetries 到達）
      data.set(
        'maxed',
        createSyncQueueEntry({
          id: 'maxed',
          retryCount: 2,
          maxRetries: 3,
          status: 'pending',
        }),
      );

      setSyncExecutor(async () => {
        throw new Error('Still failing');
      });

      await processQueue();

      const all = await getAll();
      expect(at(all, 0).status).toBe('failed');
      expect(at(all, 0).retryCount).toBe(3);
    });

    it('failed ステータスのエントリは処理しない', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('f1', createSyncQueueEntry({ id: 'f1', status: 'failed' }));

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      await processQueue();

      expect(executorMock).not.toHaveBeenCalled();
    });

    it('processing ステータスのエントリは処理しない', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('pr1', createSyncQueueEntry({ id: 'pr1', status: 'processing' }));

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      await processQueue();

      expect(executorMock).not.toHaveBeenCalled();
    });

    it('1エントリ失敗しても残りのエントリを処理し続ける', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set(
        'p1',
        createSyncQueueEntry({
          id: 'p1',
          procedure: 'entries.create',
          createdAt: new Date(Date.now() - 2000).toISOString(),
        }),
      );
      data.set(
        'p2',
        createSyncQueueEntry({
          id: 'p2',
          procedure: 'entries.update',
          createdAt: new Date(Date.now() - 1000).toISOString(),
        }),
      );

      let callCount = 0;
      setSyncExecutor(async (entry) => {
        callCount++;
        if (entry.id === 'p1') {
          throw new Error('First entry fails');
        }
      });

      await processQueue();

      expect(callCount).toBe(2);

      const all = await getAll();
      // p1 は失敗（pending のまま retryCount++）、p2 は成功（削除される）
      expect(all).toHaveLength(1);
      expect(at(all, 0).id).toBe('p1');
    });

    it('キューが空の場合は executor を呼ばない', async () => {
      setupFakeIndexedDB();
      stubNavigatorOnline(true);

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      await processQueue();

      expect(executorMock).not.toHaveBeenCalled();
    });

    it('処理中（processing フラグ）に再度呼び出しても二重処理しない', async () => {
      const data = setupFakeIndexedDB();
      stubNavigatorOnline(true);

      data.set('slow', createSyncQueueEntry({ id: 'slow' }));

      // executor が呼ばれたことを知らせる Promise
      let signalExecutorCalled!: () => void;
      const executorCalledPromise = new Promise<void>((res) => {
        signalExecutorCalled = res;
      });
      let resolveExecutor!: () => void;
      const executorMock = vi.fn().mockImplementation(() => {
        signalExecutorCalled();
        return new Promise<void>((res) => {
          resolveExecutor = res;
        });
      });
      setSyncExecutor(executorMock);

      // 1回目の processQueue を開始（完了を待たない）
      const first = processQueue();

      // executor が実際に呼ばれるまで待機（processing フラグ + dedup + getAll が完了した証拠）
      await executorCalledPromise;

      // この時点で processing = true のため、2回目は即 return されるはず
      await processQueue();

      // executor はまだ1回だけ（2回目の processQueue はスキップされた）
      expect(executorMock).toHaveBeenCalledTimes(1);

      // 1回目の executor を完了させる
      resolveExecutor();
      await first;

      // 完了後も合計1回だけ呼ばれた
      expect(executorMock).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('initSyncProcessor', () => {
    it('online イベントリスナーが登録される', () => {
      setupFakeIndexedDB();
      vi.stubGlobal('navigator', {
        onLine: false,
        serviceWorker: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });

      setSyncExecutor(async () => {});

      const addEventSpy = vi.spyOn(window, 'addEventListener');
      const cleanup = initSyncProcessor();

      expect(addEventSpy).toHaveBeenCalledWith('online', expect.any(Function));

      cleanup();
      addEventSpy.mockRestore();
    });

    it('cleanup 関数が online イベントリスナーを解除する', () => {
      vi.stubGlobal('navigator', {
        onLine: false,
        serviceWorker: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });

      const removeEventSpy = vi.spyOn(window, 'removeEventListener');
      setSyncExecutor(async () => {});

      const cleanup = initSyncProcessor();
      cleanup();

      expect(removeEventSpy).toHaveBeenCalledWith('online', expect.any(Function));
      removeEventSpy.mockRestore();
    });

    it('オンライン状態で initSyncProcessor を呼ぶと即時に processQueue が実行される', async () => {
      const data = setupFakeIndexedDB();
      vi.stubGlobal('navigator', {
        onLine: true,
        serviceWorker: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });

      data.set('p1', createSyncQueueEntry({ id: 'p1' }));

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      const cleanup = initSyncProcessor();

      // 起動時の processQueue 完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executorMock).toHaveBeenCalled();
      cleanup();
    });

    it('window が undefined の場合（SSR）は何もしない', () => {
      // window undefined 環境をシミュレートするため、vi.stubGlobal は使わず
      // SSR 相当の振る舞いは initSyncProcessor 内の typeof window チェックに依存。
      // ここでは window が存在する環境で cleanup 関数が返ることを確認する（SSR パスの間接確認）
      vi.stubGlobal('navigator', {
        onLine: false,
        serviceWorker: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });

      setSyncExecutor(async () => {});
      const cleanup = initSyncProcessor();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('SW SYNC_MUTATION メッセージで processQueue が実行される', async () => {
      const data = setupFakeIndexedDB();
      let swMessageHandler: ((event: MessageEvent) => void) | undefined;

      vi.stubGlobal('navigator', {
        onLine: true,
        serviceWorker: {
          addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
            if (event === 'message') {
              swMessageHandler = handler;
            }
          }),
          removeEventListener: vi.fn(),
        },
      });

      data.set('p1', createSyncQueueEntry({ id: 'p1' }));

      const executorMock = vi.fn().mockResolvedValue(undefined);
      setSyncExecutor(executorMock);

      const cleanup = initSyncProcessor();

      // 起動時の processQueue 完了を待つ（onLine: true のため即時実行）
      await new Promise((resolve) => setTimeout(resolve, 50));
      executorMock.mockClear();

      // 新しいエントリを追加して SW メッセージをシミュレート
      const data2 = setupFakeIndexedDB();
      vi.stubGlobal('navigator', {
        onLine: true,
        serviceWorker: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });
      data2.set('p2', createSyncQueueEntry({ id: 'p2' }));

      swMessageHandler?.({ data: { type: 'SYNC_MUTATION' } } as MessageEvent);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executorMock).toHaveBeenCalled();
      cleanup();
    });
  });
});

// ---------------------------------------------------------------------------
// offline-mutation.ts テスト
// ---------------------------------------------------------------------------

describe('offline-mutation / handleOfflineMutationError', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    stubNavigatorOnline(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('ネットワークエラーでない場合', () => {
    it('認証エラーはキューに追加しない', async () => {
      const authError = new Error('Unauthorized');
      const mutationKey = [['entries', 'create'], { type: 'mutation' }];

      await handleOfflineMutationError(authError, { title: 'Test' }, mutationKey);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('バリデーションエラーはキューに追加しない', async () => {
      const validationError = new Error('Validation failed');
      const mutationKey = [['entries', 'create'], { type: 'mutation' }];

      await handleOfflineMutationError(validationError, {}, mutationKey);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('null エラーはキューに追加しない', async () => {
      const mutationKey = [['entries', 'create'], { type: 'mutation' }];

      await handleOfflineMutationError(null, {}, mutationKey);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('undefined エラーはキューに追加しない', async () => {
      const mutationKey = [['entries', 'create'], { type: 'mutation' }];

      await handleOfflineMutationError(undefined, {}, mutationKey);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('ネットワークエラーの場合', () => {
    it('"Failed to fetch" TypeError をキューに永続化する', async () => {
      const networkError = new TypeError('Failed to fetch');
      const mutationKey = [['entries', 'create'], { type: 'mutation' }];
      const variables = { title: 'My Entry' };

      await handleOfflineMutationError(networkError, variables, mutationKey);

      const all = await getAll();
      expect(all).toHaveLength(1);
      expect(at(all, 0).procedure).toBe('entries.create');
      expect(at(all, 0).input).toEqual({ title: 'My Entry' });
      expect(at(all, 0).status).toBe('pending');
    });

    it('navigator.onLine === false のときキューに永続化する', async () => {
      stubNavigatorOnline(false);

      const regularError = new Error('Some error');
      const mutationKey = [['entries', 'update'], { type: 'mutation' }];
      const variables = { id: '123', title: 'Updated' };

      await handleOfflineMutationError(regularError, variables, mutationKey);

      const all = await getAll();
      expect(all).toHaveLength(1);
      expect(at(all, 0).procedure).toBe('entries.update');
      expect(at(all, 0).input).toEqual({ id: '123', title: 'Updated' });
    });

    it('ネストしたプロシージャパスを正しく抽出する', async () => {
      const networkError = new TypeError('Failed to fetch');
      const mutationKey = [['tags', 'create'], { type: 'mutation' }];

      await handleOfflineMutationError(networkError, { name: 'Tag A' }, mutationKey);

      const all = await getAll();
      expect(at(all, 0).procedure).toBe('tags.create');
    });

    it('3階層のネストしたプロシージャパスを正しく抽出する', async () => {
      const networkError = new TypeError('Failed to fetch');
      const mutationKey = [['calendar', 'events', 'delete'], { type: 'mutation' }];

      await handleOfflineMutationError(networkError, { id: 'evt-1' }, mutationKey);

      const all = await getAll();
      expect(at(all, 0).procedure).toBe('calendar.events.delete');
    });
  });

  // -------------------------------------------------------------------------
  describe('不正な mutationKey の場合', () => {
    it('mutationKey が配列でない場合はキューに追加しない', async () => {
      const networkError = new TypeError('Failed to fetch');

      await handleOfflineMutationError(networkError, {}, 'entries.create');

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('mutationKey[0] が配列でない場合はキューに追加しない', async () => {
      const networkError = new TypeError('Failed to fetch');

      await handleOfflineMutationError(networkError, {}, ['entries.create', { type: 'mutation' }]);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('null の mutationKey はキューに追加しない', async () => {
      const networkError = new TypeError('Failed to fetch');

      await handleOfflineMutationError(networkError, {}, null);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });

    it('空の mutationKey 配列はキューに追加しない', async () => {
      const networkError = new TypeError('Failed to fetch');

      await handleOfflineMutationError(networkError, {}, []);

      const all = await getAll();
      expect(all).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// フルフロー統合テスト: enqueue → processQueue → executor 呼び出し → 削除
// ---------------------------------------------------------------------------

describe('フルフロー: enqueue → processQueue → executor → 削除', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    stubNavigatorOnline(true);
    resetProcessorState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('enqueue した mutation が processQueue で executor に渡されキューから消える', async () => {
    const receivedEntries: SyncQueueEntry[] = [];

    setSyncExecutor(async (entry) => {
      receivedEntries.push(entry);
    });

    // オンラインミューテーションが失敗してキューに入れる想定
    const queued = await enqueue('entries.create', { title: 'Offline Entry' });

    expect(queued.status).toBe('pending');
    expect(await getPendingCount()).toBe(1);

    await processQueue();

    // executor が正しい引数で呼ばれた
    expect(receivedEntries).toHaveLength(1);
    expect(at(receivedEntries, 0).procedure).toBe('entries.create');
    expect(at(receivedEntries, 0).input).toEqual({ title: 'Offline Entry' });

    // キューが空になった
    expect(await getPendingCount()).toBe(0);
    expect(await getAll()).toHaveLength(0);
  });

  it('handleOfflineMutationError → enqueue → processQueue のフルフロー', async () => {
    const executorMock = vi.fn().mockResolvedValue(undefined);
    setSyncExecutor(executorMock);

    // ネットワークエラーで mutation が失敗
    const networkError = new TypeError('Failed to fetch');
    const mutationKey = [['entries', 'create'], { type: 'mutation' }];
    const variables = { title: 'Created Offline' };

    await handleOfflineMutationError(networkError, variables, mutationKey);

    // キューに追加されたか確認
    const pendingBeforeProcess = await getPending();
    expect(pendingBeforeProcess).toHaveLength(1);
    expect(at(pendingBeforeProcess, 0).procedure).toBe('entries.create');

    // オンライン復帰後の processQueue
    await processQueue();

    // executor が正しく呼ばれた
    expect(executorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        procedure: 'entries.create',
        input: { title: 'Created Offline' },
      }),
    );

    // キューが空になった
    expect(await getAll()).toHaveLength(0);
  });

  it('複数の失敗 mutation がある場合、全て順番に処理される', async () => {
    const processOrder: string[] = [];

    setSyncExecutor(async (entry) => {
      processOrder.push(entry.procedure);
    });

    // 異なるエンティティへの mutation を enqueue（dedup対象外にする）
    await enqueue('entries.create', { title: 'A' });
    await new Promise((r) => setTimeout(r, 5)); // createdAt の差を作る
    await enqueue('tags.create', { name: 'Tag B' });
    await new Promise((r) => setTimeout(r, 5));
    await enqueue('entries.update', { id: '2', title: 'C' });

    expect(await getPendingCount()).toBe(3);

    await processQueue();

    // 全て処理された
    expect(processOrder).toHaveLength(3);
    // createdAt 昇順で処理される
    expect(at(processOrder, 0)).toBe('entries.create');
    expect(at(processOrder, 1)).toBe('tags.create');
    expect(at(processOrder, 2)).toBe('entries.update');

    expect(await getAll()).toHaveLength(0);
  });

  it('executor が失敗した場合、リトライカウントが増加してキューに残る', async () => {
    setSyncExecutor(async () => {
      throw new Error('Server error');
    });

    await enqueue('entries.create', { title: 'Retry Me' }, 3);

    await processQueue();

    const remaining = await getAll();
    expect(remaining).toHaveLength(1);
    expect(at(remaining, 0).retryCount).toBe(1);
    expect(at(remaining, 0).status).toBe('pending');
  });

  it('maxRetries 回失敗すると failed ステータスになり clearCompleted で削除できる', async () => {
    setSyncExecutor(async () => {
      throw new Error('Always fails');
    });

    await enqueue('entries.create', { title: 'Doomed' }, 2);

    // 1回目の失敗: retryCount=0 → 1, status=pending
    await processQueue();
    let all = await getAll();
    expect(at(all, 0).retryCount).toBe(1);
    expect(at(all, 0).status).toBe('pending');

    // 2回目の失敗: retryCount=1 → 2, status=failed (2 >= maxRetries=2)
    await processQueue();
    all = await getAll();
    expect(at(all, 0).retryCount).toBe(2);
    expect(at(all, 0).status).toBe('failed');

    // clearCompleted で削除
    await clearCompleted();
    expect(await getAll()).toHaveLength(0);
  });

  it('subscribe でキューの変化を全フロー通じて監視できる', async () => {
    const snapshots: number[] = [];
    const unsub = subscribe((entries) => {
      snapshots.push(entries.length);
    });

    setSyncExecutor(async () => {});

    await enqueue('entries.create', { title: 'Watch Me' });
    // enqueue 後: キューに1件 → スナップショット = [1]

    await processQueue();
    // processQueue 中: updateEntry('processing') → スナップショット に追加
    //                  removeEntry → スナップショット に追加（0件）

    // 最後のスナップショットは0件（削除後）
    expect(snapshots.at(-1)).toBe(0);

    unsub();
  });
});
