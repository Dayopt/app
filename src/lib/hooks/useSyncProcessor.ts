'use client';

import { useEffect } from 'react';

import { vanillaTrpc } from '@/lib/trpc/client';

import { logger } from '@/lib/logger';
import { initSyncProcessor, setSyncExecutor } from '@/lib/pwa/sync-processor';

import type { SyncQueueEntry } from '@/lib/pwa/sync-queue';

/**
 * tRPCプロシージャパスからvanillaTrpcの.mutate()を呼び出す
 *
 * entry.procedure = 'entries.create' →
 * vanillaTrpc.entries.create.mutate(entry.input)
 */
async function executeMutation(entry: SyncQueueEntry): Promise<void> {
  const parts = entry.procedure.split('.');

  let target: Record<string, unknown> = vanillaTrpc as Record<string, unknown>;

  for (const part of parts) {
    const next = target[part];
    if (next === undefined || next === null || typeof next !== 'object') {
      throw new Error(`Unknown tRPC procedure: ${entry.procedure}`);
    }
    target = next as Record<string, unknown>;
  }

  const mutate = target['mutate'];
  if (typeof mutate !== 'function') {
    throw new Error(`${entry.procedure} is not a mutation`);
  }

  await (mutate as (input: unknown) => Promise<unknown>)(entry.input);
}

/**
 * 同期プロセッサー初期化フック
 *
 * tRPCクライアント（vanilla）を使ってキュー内のmutationを再送する。
 * Providers内で1度だけ呼ぶ。
 */
export function useSyncProcessor(): void {
  useEffect(() => {
    // tRPC vanillaクライアント経由でmutationを実行するexecutorを登録
    setSyncExecutor(async (entry) => {
      logger.info(`[SyncProcessor] Executing: ${entry.procedure}`);
      await executeMutation(entry);
    });

    // online/SWメッセージリスナーを登録
    const cleanup = initSyncProcessor();

    return cleanup;
  }, []);
}
