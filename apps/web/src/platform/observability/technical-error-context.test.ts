import { describe, expect, it } from 'vitest';

import { createTechnicalErrorTags, resolveTechnicalRequestId } from './technical-error-context';

describe('technical error context', () => {
  it('keeps allowlisted technical values and strips route queries', () => {
    expect(
      createTechnicalErrorTags({
        feature: 'web',
        operation: 'next_request_error',
        route: '/search?q=private',
        requestId: 'iad1::request-123',
      }),
    ).toEqual({
      feature: 'web',
      operation: 'next_request_error',
      route: '/search',
      requestId: 'iad1::request-123',
    });
  });

  it('prefers Vercel request IDs and rejects arbitrary header content', () => {
    expect(
      resolveTechnicalRequestId(
        new Headers({ 'x-vercel-id': 'iad1::request-123', 'x-request-id': 'fallback' }),
      ),
    ).toBe('iad1::request-123');
    expect(resolveTechnicalRequestId(new Headers({ 'x-vercel-id': 'private value' }))).toBe(
      undefined,
    );
    expect(resolveTechnicalRequestId(new Headers({ 'x-request-id': 'user-controlled-123' }))).toBe(
      undefined,
    );
  });

  it('reads case-insensitive Next request header records', () => {
    expect(resolveTechnicalRequestId({ 'X-Vercel-ID': ['iad1::request-456'] })).toBe(
      'iad1::request-456',
    );
  });
});
