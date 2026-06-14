import { ServiceError } from '@/lib/trpc/errors';

export class TagServiceError extends ServiceError {
  constructor(
    code:
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
      | 'UNGROUP_CONFLICTS'
      | 'GROUP_NAME_CONFLICT',
    message: string,
  ) {
    super(code, message);
    this.name = 'TagServiceError';
  }
}
