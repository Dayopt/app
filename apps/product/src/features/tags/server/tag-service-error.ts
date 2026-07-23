import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { ServiceError } from '@/lib/trpc/errors';

type TagServiceErrorCode =
  | 'FETCH_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'DELETE_FAILED'
  | 'NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'INVALID_INPUT'
  | 'MERGE_FAILED'
  | 'SAME_TAG_MERGE'
  | 'TARGET_NOT_FOUND'
  | 'CONFLICT'
  | 'UNGROUP_CONFLICTS'
  | 'GROUP_NAME_CONFLICT';

export class TagServiceError extends ServiceError {
  constructor(code: TagServiceErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'TagServiceError';
  }
}

export function createTagDatabaseError(
  error: unknown,
  code: Extract<
    TagServiceErrorCode,
    'FETCH_FAILED' | 'CREATE_FAILED' | 'UPDATE_FAILED' | 'DELETE_FAILED' | 'MERGE_FAILED'
  >,
  message: string,
  operation: string,
): TagServiceError {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === '40P01' || error.code === '55P03' || error.code === '57014')
  ) {
    return new TagServiceError('CONFLICT', 'Tag data is busy. Reload and try again.');
  }

  const original = captureUnexpectedDatabaseError(error, {
    feature: 'tags',
    operation,
  });
  return new TagServiceError(code, message, { cause: original });
}
