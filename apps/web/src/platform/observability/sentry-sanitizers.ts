import {
  isExplicitUserCancellation,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeSentrySpan,
  sanitizeSentryTransaction,
} from '@dayopt/observability';

type UnknownRecord = Record<string, unknown>;

function sanitizeWith<T extends object>(
  value: T,
  sanitizer: (input: UnknownRecord) => UnknownRecord,
): T {
  return sanitizer(value as unknown as UnknownRecord) as unknown as T;
}

function sanitizeNullableWith<T extends object>(
  value: T,
  sanitizer: (input: UnknownRecord) => UnknownRecord | null,
): T | null {
  return sanitizer(value as unknown as UnknownRecord) as unknown as T | null;
}

/** Preserve unexpected errors, including timeout-related aborts, and remove sensitive data. */
export function sanitizeErrorEvent<T extends object>(
  event: T,
  hint?: { originalException?: unknown },
): T | null {
  if (isExplicitUserCancellation(hint?.originalException)) return null;
  return sanitizeWith(event, sanitizeSentryEvent);
}

export function sanitizeTransactionEvent<T extends object>(event: T): T {
  return sanitizeWith(event, sanitizeSentryTransaction);
}

export function sanitizeSpanEvent<T extends object>(span: T): T {
  return sanitizeWith(span, sanitizeSentrySpan);
}

export function sanitizeBreadcrumbEvent<T extends object>(breadcrumb: T): T | null {
  return sanitizeNullableWith(breadcrumb, sanitizeSentryBreadcrumb);
}
