/**
 * サービス層の共通エラーハンドリング
 *
 * すべてのサービスエラーをTRPCエラーに変換するための統一ヘルパー
 */

import * as Sentry from '@sentry/nextjs';
import { TRPCError } from '@trpc/server';

import { ERROR_CODE_MAP, type TRPCErrorCode } from './error-code-map';

/**
 * サービスエラーの基底クラス
 *
 * 各サービス（PlanService, NotificationService等）はこのクラスを継承して
 * 独自のエラークラスを作成する
 */
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * codeプロパティを持つエラーかどうかを判定
 */
function hasErrorCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * サービスエラーをTRPCエラーに変換
 *
 * codeプロパティを持つ任意のErrorに対応。
 * ServiceErrorを継承していないエラークラスも処理可能。
 *
 * @param error - キャッチしたエラー
 * @throws TRPCError - 常にスローされる（戻り値はnever）
 *
 * @example
 * ```typescript
 * try {
 *   return await service.list({ userId })
 * } catch (error) {
 *   handleServiceError(error)
 * }
 * ```
 */
export function handleServiceError(error: unknown): never {
  // TRPCError の場合はそのまま再スロー
  if (error instanceof TRPCError) {
    throw error;
  }

  // codeプロパティを持つエラー（ServiceError, TagServiceError等）
  if (hasErrorCode(error)) {
    const trpcCode = ERROR_CODE_MAP[error.code] ?? 'INTERNAL_SERVER_ERROR';

    // サーバー側の異常（INTERNAL_SERVER_ERROR）のみSentryに報告
    if (trpcCode === 'INTERNAL_SERVER_ERROR') {
      Sentry.captureException(error, {
        tags: { serviceErrorCode: error.code, source: 'trpc_service' },
      });
    }

    throw new TRPCError({
      code: trpcCode,
      message: sanitizeErrorMessage(trpcCode, error.message),
      cause: error,
    });
  }

  // 未知のエラーは常にSentryに報告
  Sentry.captureException(error, {
    tags: { source: 'trpc_service', errorType: 'unknown' },
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: sanitizeErrorMessage(
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred',
    ),
    cause: error,
  });
}

/**
 * 本番環境でサーバー起因エラーのメッセージからDB詳細を隠す
 */
function sanitizeErrorMessage(trpcCode: TRPCErrorCode | string, originalMessage: string): string {
  if (process.env.NODE_ENV !== 'production') return originalMessage;
  if (trpcCode === 'INTERNAL_SERVER_ERROR') return 'サーバーエラーが発生した';
  return originalMessage;
}
