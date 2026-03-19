/**
 * オフラインmutation永続化
 *
 * TanStack Queryのmutationがネットワークエラーで失敗した場合、
 * 同期キュー（IndexedDB）に永続化して、オンライン復帰時に再送する。
 *
 * TanStack Query の `networkMode: 'offlineFirst'` はメモリ内でのみ
 * mutationを保持するため、ページリロードやタブクローズで失われる。
 * この機能はそのギャップを埋める。
 */

import { logger } from '@/lib/logger';

import { enqueue } from './sync-queue';

/**
 * ネットワークエラーかどうかを判定
 */
function isNetworkError(error: unknown): boolean {
  // fetch API の TypeError（ネットワーク不通）
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }

  // navigator.onLine が false
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }

  return false;
}

/**
 * tRPC mutation のメタデータからプロシージャパスを抽出
 *
 * TanStack Query の mutation key は tRPC が自動設定:
 * [['entries', 'create'], { type: 'mutation' }]
 */
function extractProcedurePath(mutationKey: unknown): string | null {
  if (!Array.isArray(mutationKey)) return null;

  const pathParts = mutationKey[0];
  if (!Array.isArray(pathParts)) return null;

  return pathParts.join('.');
}

/**
 * MutationCacheのonErrorで呼び出すハンドラー
 *
 * ネットワークエラーの場合のみキューに永続化する。
 * 認証エラーやバリデーションエラーは永続化しない（再送しても失敗するため）。
 *
 * @example
 * ```typescript
 * new MutationCache({
 *   onError: (error, variables, _context, mutation) => {
 *     handleAuthError(error);
 *     handleOfflineMutationError(error, variables, mutation.options.mutationKey);
 *   },
 * })
 * ```
 */
export async function handleOfflineMutationError(
  error: unknown,
  variables: unknown,
  mutationKey: unknown,
): Promise<void> {
  if (!isNetworkError(error)) return;

  const procedure = extractProcedurePath(mutationKey);
  if (!procedure) {
    logger.warn('[OfflineMutation] Could not extract procedure path from mutation key');
    return;
  }

  try {
    await enqueue(procedure, variables);
    logger.info(`[OfflineMutation] Persisted: ${procedure}`);
  } catch (enqueueError) {
    logger.error('[OfflineMutation] Failed to enqueue:', enqueueError);
  }
}
