import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';

import { getErrorMessage } from './get-error-message';

interface HandleMutationErrorOptions {
  /** toast に表示するフォールバック文言（既に翻訳済み） */
  fallback: string;
  /** logger に記録するコンテキスト名（既定: 'mutation'） */
  scope?: string;
}

/**
 * mutation の onError で共通的に呼ぶ失敗ハンドラ。
 *
 * - `logger.warn` で構造化ログに残す
 * - ユーザーには `toast.error` で通知する（silent 失敗を防ぐ）
 *
 * tRPC / TanStack Query の onError は楽観的更新のロールバックのために使われる
 * ことが多いが、rollback だけで終わってユーザーに失敗が伝わらないケースが
 * 散見される。この helper を呼ぶことで「ロールバックした後、ユーザーにも
 * 伝える」を一行で揃えられる。
 *
 * @example
 * ```ts
 * onError: (err, _vars, context) => {
 *   rollbackCache(context);
 *   handleMutationError(err, { fallback: t('toast.updateFailed'), scope: 'tag.update' });
 * }
 * ```
 */
export function handleMutationError(
  error: unknown,
  { fallback, scope = 'mutation' }: HandleMutationErrorOptions,
): void {
  const message = getErrorMessage(error, fallback);
  logger.warn({ scope, error: message }, fallback);
  toast.error(message || fallback);
}
