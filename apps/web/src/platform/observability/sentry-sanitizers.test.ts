import { describe, expect, it } from 'vitest';

import { UserCancellationError } from '@dayopt/observability';

import { sanitizeBreadcrumbEvent, sanitizeErrorEvent } from './sentry-sanitizers';

describe('Web Sentry error filtering', () => {
  it('keeps AbortError because it can represent an actionable timeout', () => {
    expect(
      sanitizeErrorEvent({
        exception: { values: [{ type: 'AbortError', value: 'The operation was aborted' }] },
      }),
    ).not.toBeNull();
  });

  it('drops an explicitly marked user cancellation', () => {
    expect(
      sanitizeErrorEvent(
        { exception: { values: [{ type: 'UserCancellationError' }] } },
        { originalException: new UserCancellationError() },
      ),
    ).toBeNull();
  });

  it('keeps network and chunk failures actionable', () => {
    const networkEvent = {
      exception: { values: [{ type: 'TypeError', value: 'Network request failed' }] },
    };
    const chunkEvent = {
      exception: { values: [{ type: 'ChunkLoadError', value: 'Loading chunk failed' }] },
    };

    expect(sanitizeErrorEvent(networkEvent)).not.toBeNull();
    expect(sanitizeErrorEvent(chunkEvent)).not.toBeNull();
  });

  it('preserves Sentry protocol IDs while removing query strings', () => {
    const result = sanitizeErrorEvent({
      event_id: '1234567890abcdef1234567890abcdef',
      contexts: {
        trace: {
          trace_id: 'abcdef1234567890abcdef1234567890',
          span_id: 'abcdef1234567890',
        },
      },
      request: { url: 'https://dayopt.com/search?q=private' },
    });

    expect(result?.event_id).toBe('1234567890abcdef1234567890abcdef');
    expect(result?.contexts.trace.trace_id).toBe('abcdef1234567890abcdef1234567890');
    expect(result?.contexts.trace.span_id).toBe('abcdef1234567890');
    expect(result?.request.url).toBe('https://dayopt.com/search');
  });
});

describe('Web Sentry breadcrumbs', () => {
  it('drops default console breadcrumbs that can contain free-form PII', () => {
    expect(
      sanitizeBreadcrumbEvent({
        category: 'console',
        message: 'user@example.com signed in',
      }),
    ).toBeNull();
  });

  it('keeps sanitized technical breadcrumbs', () => {
    expect(
      sanitizeBreadcrumbEvent({
        category: 'navigation',
        data: { url: 'https://dayopt.com/search?q=private' },
      }),
    ).toEqual({
      category: 'navigation',
      data: { url: 'https://dayopt.com/search' },
    });
  });
});
