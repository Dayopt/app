/**
 * エラーハンドリングユーティリティ
 *
 * アプリケーション全体で一貫したエラーハンドリングを提供します。
 */

import { isDevelopment } from '@/platform/config/env';

/**
 * エラーカテゴリ
 */
export enum ErrorCategory {
  /** ネットワークエラー（API呼び出し失敗など） */
  NETWORK = 'NETWORK',
  /** ファイルシステムエラー（MDXファイル読み込み失敗など） */
  FILESYSTEM = 'FILESYSTEM',
  /** バリデーションエラー（不正なデータ形式など） */
  VALIDATION = 'VALIDATION',
  /** 外部サービスエラー（GitHub API、Upstash など） */
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  /** 内部エラー（予期しないエラー） */
  INTERNAL = 'INTERNAL',
  /** ユーザー操作エラー（存在しないページへのアクセスなど） */
  USER = 'USER',
}

/**
 * エラーログレベル
 */
export enum ErrorLevel {
  /** 情報（通常のログ） */
  INFO = 'INFO',
  /** 警告（エラーではないが注意が必要） */
  WARN = 'WARN',
  /** エラー（処理は継続可能） */
  ERROR = 'ERROR',
  /** 致命的エラー（処理継続不可） */
  FATAL = 'FATAL',
}

/**
 * 構造化されたエラー情報
 */
export interface StructuredError {
  /** エラーメッセージ */
  message: string;
  /** エラーカテゴリ */
  category: ErrorCategory;
  /** エラーレベル */
  level: ErrorLevel;
  /** エラーコンテキスト（発生場所など） */
  context?: string;
  /** 元のエラーオブジェクト */
  originalError?: unknown;
  /** タイムスタンプ */
  timestamp: Date;
  /** スタックトレース（開発環境のみ） */
  stack?: string;
}

/**
 * unknown型のエラーを安全にErrorオブジェクトに変換
 *
 * @param error - 変換するエラー
 * @returns Error オブジェクト
 *
 * @example
 * try {
 *   throw 'string error';
 * } catch (err) {
 *   const error = toError(err); // Error オブジェクトに変換
 *   console.log(error.message); // 'string error'
 * }
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (typeof error === 'object' && error !== null) {
    // オブジェクトの場合は JSON.stringify を試みる
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('[Unstringifiable Error Object]');
    }
  }

  return new Error(String(error));
}

/**
 * エラーメッセージを安全に取得
 *
 * @param error - エラーオブジェクト
 * @returns エラーメッセージ
 *
 * @example
 * getErrorMessage(new Error('test')) // 'test'
 * getErrorMessage('string error') // 'string error'
 * getErrorMessage({ code: 404 }) // '{"code":404}'
 * getErrorMessage(null) // 'Unknown error'
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return '[Unstringifiable Error]';
    }
  }

  if (error === null || error === undefined) {
    return 'Unknown error';
  }

  return String(error);
}

/**
 * 構造化されたエラーを作成
 *
 * @param message - エラーメッセージ
 * @param category - エラーカテゴリ
 * @param level - エラーレベル
 * @param context - エラーコンテキスト（発生場所など）
 * @param originalError - 元のエラーオブジェクト
 * @returns 構造化されたエラー
 */
export function createStructuredError(
  message: string,
  category: ErrorCategory,
  level: ErrorLevel = ErrorLevel.ERROR,
  context?: string,
  originalError?: unknown,
): StructuredError {
  const error = originalError ? toError(originalError) : undefined;

  return {
    message,
    category,
    level,
    context,
    originalError,
    timestamp: new Date(),
    stack: isDevelopment && error ? error.stack : undefined,
  };
}

/**
 * エラーをログに記録
 *
 * 開発環境と本番環境で出力形式を切り替えます。
 *
 * @param structuredError - 構造化されたエラー
 */
export function logError(structuredError: StructuredError): void {
  const { message, category, level, context, originalError, timestamp, stack } = structuredError;

  // ログプレフィックス
  const prefix = context ? `[${context}]` : `[${category}]`;
  const fullMessage = `${prefix} ${message}`;

  // レベルに応じたログ出力
  switch (level) {
    case ErrorLevel.INFO:
      console.log(fullMessage);
      break;
    case ErrorLevel.WARN:
      console.warn(fullMessage);
      break;
    case ErrorLevel.ERROR:
    case ErrorLevel.FATAL:
      console.error(fullMessage);
      break;
  }

  // 開発環境では詳細情報を出力
  if (isDevelopment) {
    if (originalError) {
      console.error('Original error:', originalError);
    }
    if (stack) {
      console.error('Stack trace:', stack);
    }
    console.error('Timestamp:', timestamp.toISOString());
  }

  // TODO: 本番環境ではエラートラッキングサービス（Sentry など）に送信
  // if (isProduction && level === ErrorLevel.FATAL) {
  //   sendToErrorTracking(structuredError);
  // }
}

/**
 * エラーをキャッチして安全に処理
 *
 * @param fn - 実行する関数
 * @param context - エラーコンテキスト
 * @param category - エラーカテゴリ
 * @param fallbackValue - エラー発生時の返却値
 * @returns 関数の実行結果またはfallbackValue
 *
 * @example
 * const result = await safeAsync(
 *   () => fetch('/api/data'),
 *   'API Request',
 *   ErrorCategory.NETWORK,
 *   null
 * );
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string,
  category: ErrorCategory,
  fallbackValue: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const structuredError = createStructuredError(
      getErrorMessage(error),
      category,
      ErrorLevel.ERROR,
      context,
      error,
    );
    logError(structuredError);
    return fallbackValue;
  }
}

/**
 * 同期関数をエラーハンドリング付きで実行
 *
 * @param fn - 実行する関数
 * @param context - エラーコンテキスト
 * @param category - エラーカテゴリ
 * @param fallbackValue - エラー発生時の返却値
 * @returns 関数の実行結果またはfallbackValue
 *
 * @example
 * const result = safeSync(
 *   () => JSON.parse(data),
 *   'JSON Parse',
 *   ErrorCategory.VALIDATION,
 *   {}
 * );
 */
export function safeSync<T>(
  fn: () => T,
  context: string,
  category: ErrorCategory,
  fallbackValue: T,
): T {
  try {
    return fn();
  } catch (error) {
    const structuredError = createStructuredError(
      getErrorMessage(error),
      category,
      ErrorLevel.ERROR,
      context,
      error,
    );
    logError(structuredError);
    return fallbackValue;
  }
}

/**
 * AbortError（fetch中断）かどうかを判定
 *
 * @param error - エラーオブジェクト
 * @returns AbortErrorの場合true
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * NetworkError（ネットワークエラー）かどうかを判定
 *
 * @param error - エラーオブジェクト
 * @returns NetworkErrorの場合true
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    error.name === 'NetworkError'
  );
}

/**
 * TimeoutError（タイムアウトエラー）かどうかを判定
 *
 * @param error - エラーオブジェクト
 * @returns TimeoutErrorの場合true
 */
export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    error.name === 'TimeoutError' ||
    isAbortError(error) // AbortController によるタイムアウトも含む
  );
}

/**
 * エラーハンドリングのベストプラクティス例
 *
 * @example
 * // 1. API呼び出し
 * try {
 *   const response = await fetch('/api/data');
 *   if (!response.ok) throw new Error('API request failed');
 *   return await response.json();
 * } catch (error) {
 *   logError(
 *     createStructuredError(
 *       getErrorMessage(error),
 *       ErrorCategory.NETWORK,
 *       ErrorLevel.ERROR,
 *       'fetchData',
 *       error
 *     )
 *   );
 *   return null;
 * }
 *
 * @example
 * // 2. safeAsync を使用（推奨）
 * const data = await safeAsync(
 *   () => fetch('/api/data').then(res => res.json()),
 *   'fetchData',
 *   ErrorCategory.NETWORK,
 *   null
 * );
 *
 * @example
 * // 3. ファイル読み込み
 * const content = safeSync(
 *   () => fs.readFileSync('file.txt', 'utf8'),
 *   'readFile',
 *   ErrorCategory.FILESYSTEM,
 *   ''
 * );
 */
