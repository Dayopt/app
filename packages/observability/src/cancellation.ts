export const USER_CANCELLATION_ERROR_CODE = 'DAYOPT_USER_CANCELLED';

/** Explicit marker for a user-initiated cancellation that should not create an Issue. */
export class UserCancellationError extends Error {
  readonly code = USER_CANCELLATION_ERROR_CODE;

  constructor(message = 'The user cancelled the operation', options?: ErrorOptions) {
    super(message, options);
    this.name = 'UserCancellationError';
  }
}

/** AbortError alone is intentionally insufficient because it also represents timeouts. */
export function isExplicitUserCancellation(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    'code' in value &&
    (value as { code?: unknown }).code === USER_CANCELLATION_ERROR_CODE
  );
}
