/**
 * サービス層の共通エラーハンドリング
 *
 * すべてのサービスエラーをTRPCエラーに変換するための統一ヘルパー
 */

import { isExplicitUserCancellation } from '@dayopt/observability';
import { TRPCError } from '@trpc/server';

import { captureUnexpectedError, isExpectedAuthError } from '@/lib/sentry';

import { ERROR_CODE_MAP, type TRPCErrorCode } from './error-code-map';

const EXPECTED_TRPC_CODES = new Set<TRPCError['code']>([
  'PARSE_ERROR',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'PAYMENT_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_SUPPORTED',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNPROCESSABLE_CONTENT',
  'TOO_MANY_REQUESTS',
]);

/** Client/validation outcomes are expected and must not create Sentry Issues. */
export function isExpectedTrpcError(error: TRPCError): boolean {
  return (
    EXPECTED_TRPC_CODES.has(error.code) ||
    (error.code === 'CLIENT_CLOSED_REQUEST' &&
      isExplicitUserCancellation(getOriginalError(error))) ||
    (error.code === 'SERVICE_UNAVAILABLE' && isWriteFencedError(error))
  );
}

/**
 * Narrows SERVICE_UNAVAILABLE to the write-fence case specifically, so other existing
 * SERVICE_UNAVAILABLE throws (e.g. rate-limit backend outages) keep reporting to Sentry as
 * genuine anomalies. The fence is an operator-triggered, high-frequency event during an
 * active incident — reporting every blocked mutation as "unexpected" would flood Sentry
 * exactly when it is being used to observe the incident itself.
 */
function isWriteFencedError(error: TRPCError): boolean {
  return error.cause instanceof ServiceError && error.cause.code === 'WRITE_FENCED';
}

/** Return the deepest Error cause so Sentry retains the original stack. */
export function getOriginalError(error: Error): Error {
  const seen = new WeakSet<Error>();
  let current = error;

  while (current.cause instanceof Error && !seen.has(current.cause)) {
    seen.add(current);
    current = current.cause;
  }

  return current;
}

/** Captures only unexpected failures which the tRPC HTTP adapter will serialize. */
export function captureUnexpectedTrpcAdapterError(error: TRPCError, operation: string): void {
  if (isExpectedTrpcError(error)) return;

  const original = getOriginalError(error);
  if (isExpectedAuthError(original)) return;

  captureUnexpectedError(original, {
    errorCode: error.code,
    feature: 'trpc',
    operation,
    route: '/api/trpc',
    source: 'trpc_adapter',
  });
}

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
    options?: ErrorOptions,
  ) {
    super(message, options);
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
  // 既存のTRPCErrorは同じinstanceを再スローし、予期しないserver failureだけを報告する。
  if (error instanceof TRPCError) {
    const original = getOriginalError(error);
    if (!isExpectedTrpcError(error) && !isExpectedAuthError(original)) {
      captureUnexpectedError(original, {
        errorCode: error.code,
        source: 'trpc_service',
        operation: 'handle_trpc_error',
      });
    }
    throw error;
  }

  // codeプロパティを持つエラー（ServiceError, TagServiceError等）
  if (hasErrorCode(error)) {
    const trpcCode = ERROR_CODE_MAP[error.code] ?? 'INTERNAL_SERVER_ERROR';
    const original = getOriginalError(error);

    // サーバー側の異常とtimeoutをSentryに報告
    if (
      (trpcCode === 'INTERNAL_SERVER_ERROR' || trpcCode === 'TIMEOUT') &&
      !isExpectedAuthError(original)
    ) {
      captureUnexpectedError(original, {
        errorCode: error.code,
        source: 'trpc_service',
        operation: 'handle_service_error',
      });
    }

    throw new TRPCError({
      code: trpcCode,
      message: sanitizeErrorMessage(trpcCode, error.message),
      cause: error,
    });
  }

  // 未知のエラーは常にSentryに報告
  const unexpectedError = error instanceof Error ? error : new Error('Unknown service error');
  if (!isExpectedAuthError(unexpectedError)) {
    captureUnexpectedError(unexpectedError, {
      source: 'trpc_service',
      operation: 'handle_unknown_error',
    });
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: sanitizeErrorMessage(
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : 'Unknown error occurred',
    ),
    cause: unexpectedError,
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
