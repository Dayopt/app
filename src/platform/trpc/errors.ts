/**
 * サービス層の共通エラーハンドリング
 *
 * すべてのサービスエラーをTRPCエラーに変換するための統一ヘルパー
 */

import * as Sentry from '@sentry/nextjs';
import { TRPCError } from '@trpc/server';

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

/** tRPCエラーコードの型定義 */
export type TRPCErrorCode =
  | 'INTERNAL_SERVER_ERROR'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'CONFLICT';

/**
 * エラーコードとTRPCエラーコードのマッピング
 *
 * 全サービスのエラーコードを一元管理
 */
export const ERROR_CODE_MAP: Record<string, TRPCErrorCode> = {
  // ===== 共通エラー =====
  FETCH_FAILED: 'INTERNAL_SERVER_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CREATE_FAILED: 'INTERNAL_SERVER_ERROR',
  UPDATE_FAILED: 'INTERNAL_SERVER_ERROR',
  DELETE_FAILED: 'INTERNAL_SERVER_ERROR',
  VALIDATION_FAILED: 'BAD_REQUEST',
  INVALID_INPUT: 'BAD_REQUEST',

  // ===== 認証・認可エラー =====
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_PASSWORD: 'UNAUTHORIZED',

  // ===== Tag関連 =====
  DUPLICATE_NAME: 'BAD_REQUEST',
  MERGE_FAILED: 'INTERNAL_SERVER_ERROR',
  SAME_TAG_MERGE: 'BAD_REQUEST',
  TARGET_NOT_FOUND: 'NOT_FOUND',
  UNGROUP_CONFLICTS: 'BAD_REQUEST',
  GROUP_NAME_CONFLICT: 'BAD_REQUEST',

  // ===== Tag並び替え関連 =====
  REORDER_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== Palette関連 =====
  PIN_FAILED: 'INTERNAL_SERVER_ERROR',
  UNPIN_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== History関連 =====
  FETCH_PINNED_FAILED: 'INTERNAL_SERVER_ERROR',
  FETCH_ENTRIES_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== Entry関連 =====
  TAG_FILTER_FAILED: 'INTERNAL_SERVER_ERROR',
  TIME_OVERLAP: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',

  // ===== Entry Transaction関連 =====
  CREATE_WITH_TAGS_FAILED: 'INTERNAL_SERVER_ERROR',
  UPDATE_WITH_TAGS_FAILED: 'INTERNAL_SERVER_ERROR',
  DELETE_WITH_CLEANUP_FAILED: 'INTERNAL_SERVER_ERROR',
  RPC_CALL_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== User関連 =====
  EXPORT_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== Notification関連 =====
  NOTIFICATION_SEND_FAILED: 'INTERNAL_SERVER_ERROR',
  PROFILE_UPDATE_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== Reflection関連 =====
  QUOTA_EXCEEDED: 'FORBIDDEN',
  INSUFFICIENT_DATA: 'BAD_REQUEST',
  API_KEY_MISSING: 'INTERNAL_SERVER_ERROR',
  GENERATION_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== Contact関連 =====
  GITHUB_API_FAILED: 'INTERNAL_SERVER_ERROR',

  // ===== Billing関連 =====
  STRIPE_NOT_CONFIGURED: 'INTERNAL_SERVER_ERROR',
  CHECKOUT_FAILED: 'INTERNAL_SERVER_ERROR',
  PORTAL_FAILED: 'INTERNAL_SERVER_ERROR',
  SUBSCRIPTION_NOT_FOUND: 'NOT_FOUND',
};

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
      message: error.message,
      cause: error,
    });
  }

  // 未知のエラーは常にSentryに報告
  Sentry.captureException(error, {
    tags: { source: 'trpc_service', errorType: 'unknown' },
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    cause: error,
  });
}
