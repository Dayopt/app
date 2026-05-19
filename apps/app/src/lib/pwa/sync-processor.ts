/**
 * 同期キュープロセッサー
 *
 * IndexedDBのpendingなmutationをvanilla tRPCクライアント経由で再送する。
 *
 * 2つのトリガーで起動:
 * 1. オンライン復帰時（window 'online' イベント）
 * 2. SW Background Sync → 'SYNC_MUTATION' メッセージ受信時
 */

import { logger } from '@/lib/logger';

import { deduplicateQueue, getAll, removeEntry, updateEntry } from './sync-queue';

import type { SyncQueueEntry } from './sync-queue';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * mutationを実際に送信するコールバック
 *
 * tRPCクライアントの `procedure.mutate(input)` を呼び出す。
 * Providers初期化後に `setSyncExecutor` で注入する。
 */
type SyncExecutor = (entry: SyncQueueEntry) => Promise<void>;

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

let executor: SyncExecutor | null = null;
let processing = false;

/**
 * mutation実行関数を注入する
 *
 * Providers初期化時（tRPCクライアント生成後）に1度だけ呼ぶ。
 *
 * @example
 * ```typescript
 * setSyncExecutor(async (entry) => {
 *   // entry.procedure = 'entries.create' のようなドット区切りパス
 *   const parts = entry.procedure.split('.');
 *   let target = vanillaTrpc;
 *   for (const part of parts) {
 *     target = target[part];
 *   }
 *   await target.mutate(entry.input);
 * });
 * ```
 */
export function setSyncExecutor(fn: SyncExecutor): void {
  executor = fn;
}

// ---------------------------------------------------------------------------
// 処理ロジック
// ---------------------------------------------------------------------------

/**
 * キュー内のpendingなmutationを順次処理する
 *
 * 冪等性の保証はサーバー側の責務。
 * 同時実行を防ぐため `processing` フラグでガードする。
 */
export async function processQueue(): Promise<void> {
  if (processing) return;
  if (!executor) {
    logger.warn('[SyncProcessor] No executor set — skipping queue processing');
    return;
  }

  // オフラインなら処理しない
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  processing = true;
  logger.info('[SyncProcessor] Processing queue...');

  try {
    await deduplicateQueue();

    const entries = await getAll();
    const pending = entries.filter((e) => e.status === 'pending');

    for (const entry of pending) {
      try {
        await updateEntry(entry.id, { status: 'processing' });
        await executor(entry);
        await removeEntry(entry.id);
        logger.info(`[SyncProcessor] Success: ${entry.procedure}`);
      } catch (error) {
        logger.error(`[SyncProcessor] Failed: ${entry.procedure}`, error);

        const newRetryCount = entry.retryCount + 1;
        if (newRetryCount >= entry.maxRetries) {
          await updateEntry(entry.id, {
            status: 'failed',
            retryCount: newRetryCount,
          });
        } else {
          await updateEntry(entry.id, {
            status: 'pending',
            retryCount: newRetryCount,
          });
        }
      }
    }
  } finally {
    processing = false;
  }
}

// ---------------------------------------------------------------------------
// イベントリスナー
// ---------------------------------------------------------------------------

/**
 * 同期プロセッサーを初期化
 *
 * - online イベントでキュー処理を開始
 * - SW からの SYNC_MUTATION メッセージでもキュー処理を開始
 *
 * @returns クリーンアップ関数
 */
export function initSyncProcessor(): () => void {
  if (typeof window === 'undefined') return () => {};

  // オンライン復帰時にキュー処理
  const handleOnline = () => {
    logger.info('[SyncProcessor] Online — processing queue');
    processQueue();
  };

  window.addEventListener('online', handleOnline);

  // SW からの SYNC_MUTATION メッセージ受信時にキュー処理
  const handleSWMessage = (event: MessageEvent) => {
    if (event.data?.type === 'SYNC_MUTATION') {
      logger.info('[SyncProcessor] SW sync message received');
      processQueue();
    }
  };

  navigator.serviceWorker?.addEventListener('message', handleSWMessage);

  // 起動時にpendingがあれば即処理（前回ブラウザ閉じた時の残り）
  if (navigator.onLine) {
    processQueue();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
  };
}
