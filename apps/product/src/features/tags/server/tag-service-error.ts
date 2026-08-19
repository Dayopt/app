import { ServiceError } from '@/lib/trpc/errors';

/**
 * CRUD / マージ / アーカイブ向けのコードは対応する service ごと撤去済み
 * （#2162 tag-model-replacement Step 7）。残る `tag-query-service.ts` は
 * `FETCH_FAILED` しか投げない。
 */
type TagServiceErrorCode = 'FETCH_FAILED';

export class TagServiceError extends ServiceError {
  constructor(code: TagServiceErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'TagServiceError';
  }
}
