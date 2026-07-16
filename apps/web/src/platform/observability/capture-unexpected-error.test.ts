import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTags: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  withScope: (callback: (scope: typeof sentry) => void) => callback(sentry),
}));

import { captureUnexpectedWebError } from './capture-unexpected-error';

describe('captureUnexpectedWebError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures the original Error once with sanitized technical tags', () => {
    const original = new Error('GitHub request failed');

    captureUnexpectedWebError(original, {
      feature: 'contact',
      operation: 'create_github_issue',
      route: '/api/contact?email=private@example.com',
    });
    captureUnexpectedWebError(original, { feature: 'duplicate' });

    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(original);
    expect(sentry.setTags).toHaveBeenCalledWith({
      feature: 'contact',
      operation: 'create_github_issue',
      route: '/api/contact',
    });
  });

  it('normalizes a non-Error without serializing its value', () => {
    const providerFailure = { message: 'private feedback' };
    const original = captureUnexpectedWebError(providerFailure, {
      feature: 'contact',
      operation: 'unknown_failure',
    });

    expect(original).toBeInstanceOf(Error);
    expect(original.message).toBe('Unexpected Web failure');
    expect(original.cause).toBe(providerFailure);
    expect(sentry.captureException).toHaveBeenCalledWith(original);

    expect(
      captureUnexpectedWebError(providerFailure, {
        feature: 'contact',
        operation: 'nested_failure',
      }),
    ).toBe(original);
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });
});
