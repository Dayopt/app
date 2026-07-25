import { ServiceError } from '@/lib/trpc/errors';

/**
 * external-calendar の service 層が投げるエラー。
 *
 * `timeblock-service-error.ts` と同型。code は `lib/trpc/error-code-map.ts` に登録しないと
 * router の `handleServiceError` が暗黙に INTERNAL_SERVER_ERROR + 無条件 Sentry 送信に落とす。
 */
export class ExternalCalendarServiceError extends ServiceError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message);
    this.name = 'ExternalCalendarServiceError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
