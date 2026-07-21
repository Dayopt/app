import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { UserCancellationError } from '@dayopt/observability';

import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
  scrubSentryTransaction,
  withPIIScrub,
} from '../scrub-pii';

function makeEvent(overrides: Partial<ErrorEvent>): ErrorEvent {
  return overrides as ErrorEvent;
}

describe('Product Sentry sanitizer adapters', () => {
  it('preserves protocol IDs while removing request query and PII', () => {
    const traceId = 'a'.repeat(32);
    const release = 'b'.repeat(40);
    const result = scrubSentryEvent(
      makeEvent({
        event_id: 'c'.repeat(32),
        release,
        message: 'user alice@example.com failed',
        request: {
          method: 'POST',
          url: 'https://app.dayopt.com/api/trpc?input=private',
          data: { contactMessage: 'private feedback' },
        },
        contexts: { trace: { trace_id: traceId, span_id: 'd'.repeat(16) } },
      }),
    );

    expect(result.release).toBe(release);
    expect(result.message).toBe('[REDACTED]');
    expect(result.request).toEqual({
      method: 'POST',
      url: 'https://app.dayopt.com/api/trpc',
    });
    expect(result.contexts?.trace?.trace_id).toBe(traceId);
  });

  it('adapts transaction, span, and breadcrumb hooks', () => {
    const transaction = scrubSentryTransaction({ transaction: '/day?search=private' });
    const span = scrubSentrySpan({
      trace_id: 'a'.repeat(32),
      span_id: 'b'.repeat(16),
      data: { 'url.full': 'https://app.dayopt.com/day?token=private' },
    });
    const breadcrumb = scrubSentryBreadcrumb({
      category: 'http',
      data: { method: 'GET', url: 'https://app.dayopt.com/day?token=private' },
    });

    expect(transaction.transaction).toBe('/day');
    expect(span.data).toEqual({ 'url.full': 'https://app.dayopt.com/day' });
    expect(breadcrumb?.data).toEqual({ method: 'GET', url: 'https://app.dayopt.com/day' });
  });
});

describe('withPIIScrub', () => {
  it('returns null when the existing filter rejects an event', () => {
    const wrapped = withPIIScrub(() => null);
    expect(wrapped(makeEvent({ message: 'noise' }), {})).toBeNull();
  });

  it('sanitizes the event returned by the existing filter', () => {
    const wrapped = withPIIScrub((event) => event);
    const result = wrapped(makeEvent({ message: 'alice@example.com' }), {});
    expect(result?.message).toBe('[REDACTED]');
  });

  it('drops only explicitly marked user cancellation and keeps timeout AbortError', () => {
    const wrapped = withPIIScrub();

    expect(
      wrapped(makeEvent({ message: 'cancelled' }), {
        originalException: new UserCancellationError(),
      }),
    ).toBeNull();
    expect(
      wrapped(makeEvent({ message: 'timed out' }), {
        originalException: new DOMException('timed out', 'AbortError'),
      }),
    ).not.toBeNull();
  });
});
