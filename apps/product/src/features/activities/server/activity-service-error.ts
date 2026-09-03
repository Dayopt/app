import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { ServiceError } from '@/lib/trpc/errors';

/**
 * Category / Activity 共通のエラーコード。
 *
 * 旧 tags と異なり階層・マージが無いため、マージ系エラーコード相当の
 * 専用コードは持たない。「アーカイブ済みカテゴリーへの割当」等の入力エラーは
 * INVALID_INPUT に畳む（`error-code-map.ts` は writer 境界外のため新規コードを
 * 追加しない。既存コードのみ再利用する）。
 */
type ActivitiesServiceErrorCode =
  | 'FETCH_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'DELETE_FAILED'
  | 'NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'INVALID_INPUT';

export class ActivitiesServiceError extends ServiceError {
  constructor(code: ActivitiesServiceErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'ActivitiesServiceError';
  }
}

export function createActivitiesDatabaseError(
  error: unknown,
  code: Extract<
    ActivitiesServiceErrorCode,
    'FETCH_FAILED' | 'CREATE_FAILED' | 'UPDATE_FAILED' | 'DELETE_FAILED'
  >,
  message: string,
  operation: string,
): ActivitiesServiceError {
  const original = captureUnexpectedDatabaseError(error, {
    feature: 'activities',
    operation,
  });
  return new ActivitiesServiceError(code, message, { cause: original });
}

/** Postgres 一意制約違反（23505）判定 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
  );
}

/** Postgres FK 違反（23503）判定。存在しない category_id を指した時に発生する */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23503'
  );
}
