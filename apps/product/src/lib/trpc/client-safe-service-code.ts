import { ServiceError } from './errors';

const CLIENT_SAFE_SERVICE_CODES = new Set([
  'RETRYABLE_CONTENTION',
  'STALE_TARGET',
  'STALE_VERSION',
  'TEMPORARY_FAILURE',
  'TIME_OVERLAP',
]);

/** UIが分岐に使うことを許可したServiceError codeだけを公開する。 */
export function getClientSafeServiceCode(error: unknown): string | undefined {
  if (!(error instanceof ServiceError)) return undefined;
  return CLIENT_SAFE_SERVICE_CODES.has(error.code) ? error.code : undefined;
}
