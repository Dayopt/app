/**
 * Product-side Sentry type adapters for the SDK-agnostic observability contract.
 */

import {
  isExplicitUserCancellation,
  sanitizeSentryBreadcrumb as sanitizeSharedBreadcrumb,
  sanitizeSentryEvent as sanitizeSharedEvent,
  sanitizeSentrySpan as sanitizeSharedSpan,
  sanitizeSentryTransaction as sanitizeSharedTransaction,
  type ObservabilityRecord,
} from '@dayopt/observability';
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs';

function asObservabilityRecord(value: object): ObservabilityRecord {
  return value as unknown as ObservabilityRecord;
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  return sanitizeSharedEvent(asObservabilityRecord(event)) as unknown as ErrorEvent;
}

export function scrubSentryTransaction<T extends object>(event: T): T {
  return sanitizeSharedTransaction(asObservabilityRecord(event)) as unknown as T;
}

export function scrubSentrySpan<T extends object>(span: T): T {
  return sanitizeSharedSpan(asObservabilityRecord(span)) as unknown as T;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return sanitizeSharedBreadcrumb(
    asObservabilityRecord(breadcrumb),
  ) as unknown as Breadcrumb | null;
}

export function withPIIScrub(
  existing?: (event: ErrorEvent, hint: EventHint) => ErrorEvent | null,
): (event: ErrorEvent, hint: EventHint) => ErrorEvent | null {
  return (event, hint) => {
    if (isExplicitUserCancellation(hint.originalException)) return null;
    const filtered = existing ? existing(event, hint) : event;
    return filtered ? scrubSentryEvent(filtered) : null;
  };
}
