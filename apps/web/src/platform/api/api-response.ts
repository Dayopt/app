import { NextResponse } from 'next/server';

/**
 * APIエラーコード
 */
export const ErrorCode = {
  // 400系
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  QUERY_TOO_LONG: 'QUERY_TOO_LONG',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CSRF_INVALID: 'CSRF_INVALID',
  BOT_DETECTED: 'BOT_DETECTED',

  // 500系
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

interface ApiErrorOptions {
  code?: ErrorCodeType;
  details?: unknown;
}

/**
 * 統一されたAPIエラーレスポンスを生成
 *
 * @example
 * return apiError('Validation failed', 400, { code: ErrorCode.VALIDATION_ERROR, details: error.issues })
 * return apiError('Not found', 404, { code: ErrorCode.NOT_FOUND })
 * return apiError('Internal error', 500)
 */
export function apiError(message: string, status: number, options?: ApiErrorOptions) {
  const body: {
    error: string;
    code?: ErrorCodeType;
    details?: unknown;
  } = { error: message };

  if (options?.code) {
    body.code = options.code;
  }

  if (options?.details) {
    body.details = options.details;
  }

  return NextResponse.json(body, { status });
}

/**
 * 成功レスポンスを生成
 */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
