/**
 * Dayopt Service Worker
 *
 * オフライン対応とキャッシング戦略を提供
 *
 * バージョニング戦略:
 * - SW自体はクエリパラメータでバージョン管理（useServiceWorker.ts）
 * - キャッシュ名にはメジャーバージョンのみ含める
 * - 破壊的変更がない限りキャッシュは引き継ぐ
 */

// SW内ログ: 開発時のみ出力（本番ではno-op）
const __SW_DEBUG__ = typeof location !== 'undefined' && location.hostname === 'localhost';
const swLog = __SW_DEBUG__ ? console.log.bind(console) : () => {};
const swError = console.error.bind(console); // エラーは常に出力

// キャッシュバージョン: 破壊的変更時のみインクリメント
const CACHE_VERSION = '3';
const CACHE_NAME = `dayopt-v${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `dayopt-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `dayopt-dynamic-v${CACHE_VERSION}`;

// 静的アセット（ビルド時に確定するファイル）
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
];

// キャッシュ対象のパターン
const CACHE_PATTERNS = {
  // 静的ファイル（長期キャッシュ）
  static: /\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico|webp|avif)$/i,
  // APIレスポンス（短期キャッシュ）
  api: /^\/api\//,
  // Next.jsの静的ファイル
  nextStatic: /^\/_next\/static\//,
};

// キャッシュしないパターン
const NO_CACHE_PATTERNS = [
  /^\/_next\/webpack-hmr/, // HMR
  /^\/api\/auth/, // 認証API
  /^\/api\/trpc/, // tRPC API（動的データ）
];

/**
 * Service Worker インストール
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        swLog('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()),
  );
});

/**
 * Service Worker アクティベート
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // 古いキャッシュを削除
              return (
                name.startsWith('dayopt-') &&
                name !== STATIC_CACHE_NAME &&
                name !== DYNAMIC_CACHE_NAME
              );
            })
            .map((name) => {
              swLog('[SW] Deleting old cache:', name);
              return caches.delete(name);
            }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

/**
 * フェッチイベントハンドラー
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 同一オリジンのみ処理
  if (url.origin !== location.origin) {
    return;
  }

  // キャッシュしないパターンをチェック
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    return;
  }

  // ナビゲーションリクエスト（HTMLページ）
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // 静的アセット
  if (CACHE_PATTERNS.static.test(url.pathname) || CACHE_PATTERNS.nextStatic.test(url.pathname)) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // その他のリクエスト
  event.respondWith(handleDynamicRequest(request));
});

/**
 * ナビゲーションリクエストの処理
 * Stale-While-Revalidate: キャッシュがあれば即返し、
 * バックグラウンドでネットワークfetchしてキャッシュを更新する
 */
async function handleNavigationRequest(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cached = await cache.match(request);

  // バックグラウンドでネットワークfetch → キャッシュ更新（次回用）
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // キャッシュがあれば即返す（バックグラウンドでfetch継続）
    return cached;
  }

  // キャッシュがない場合はネットワークを待つ
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // どちらもない場合はオフラインフォールバック
  const offlineResponse = await caches.match('/offline');
  if (offlineResponse) {
    return offlineResponse;
  }
  return new Response('オフラインです', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * 静的アセットの処理
 * Cache First with Network Fallback
 */
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Resource not available', { status: 404 });
  }
}

/**
 * 動的リクエストの処理
 * Network First with Cache Fallback
 */
async function handleDynamicRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * メッセージハンドラー
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('dayopt-'))
            .map((name) => caches.delete(name)),
        );
      }),
    );
  }

  // iOS Safari SW キャッシュ7日制限対策: keep-alive ping
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    // SWがアクティブ状態を維持するだけで十分
    swLog('[SW] Keep-alive ping received');
  }
});

/**
 * Background Sync ハンドラー
 *
 * オフライン時にキューに蓄積されたmutationを
 * オンライン復帰時にバックグラウンドで再送する
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'dayopt-sync-mutations') {
    event.waitUntil(processSyncQueue());
  }
});

/**
 * 同期キューの処理
 *
 * IndexedDBからpendingのmutationを取得し、
 * 順番に送信する。失敗した場合はリトライカウントを増やす。
 */
async function processSyncQueue() {
  const DB_NAME = 'dayopt-sync';
  const STORE_NAME = 'mutations';

  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const pending = entries.filter((e) => e.status === 'pending');

    for (const entry of pending) {
      try {
        // ステータスを processing に更新
        await updateEntryStatus(db, STORE_NAME, entry.id, 'processing');

        // クライアントにsyncリクエストを通知
        const clients = await self.clients.matchAll();
        for (const client of clients) {
          client.postMessage({
            type: 'SYNC_MUTATION',
            payload: entry,
          });
        }

        // 送信成功 → 削除
        await deleteEntry(db, STORE_NAME, entry.id);
      } catch (error) {
        swError('[SW] Sync failed for entry:', entry.id, error);

        const newRetryCount = entry.retryCount + 1;
        const newStatus = newRetryCount >= entry.maxRetries ? 'failed' : 'pending';
        await updateEntryInDB(db, STORE_NAME, entry.id, {
          retryCount: newRetryCount,
          status: newStatus,
        });
      }
    }

    db.close();
  } catch (error) {
    swError('[SW] processSyncQueue error:', error);
  }
}

function updateEntryStatus(db, storeName, id, status) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.status = status;
        store.put(entry);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

function updateEntryInDB(db, storeName, id, update) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        Object.assign(entry, update);
        store.put(entry);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

function deleteEntry(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
