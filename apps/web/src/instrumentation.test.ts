import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureRequestError: vi.fn(),
  setTags: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureRequestError: sentry.captureRequestError,
  withScope: (callback: (scope: { setTags: typeof sentry.setTags }) => void) =>
    callback({ setTags: sentry.setTags }),
}));

import { onRequestError } from './instrumentation';

const request = {
  path: '/docs/private?query=secret',
  method: 'GET',
  headers: { 'x-vercel-id': 'iad1::request-123' },
};
const context = {
  routerKind: 'App Router',
  routePath: '/docs/[slug]',
  routeType: 'route',
};

describe('Web onRequestError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL_ENV', 'production');
  });

  it('preserves Next request capture with allowlisted correlation tags', async () => {
    const original = new Error('server render failed');

    await onRequestError(original, request, context);

    expect(sentry.setTags).toHaveBeenCalledWith({
      feature: 'web',
      operation: 'next_request_error',
      route: '/docs/[slug]',
      requestId: 'iad1::request-123',
      source: 'nextjs',
    });
    expect(sentry.captureRequestError).toHaveBeenCalledWith(original, request, context);
  });

  it('does not capture Preview request failures', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    await onRequestError(new Error('preview failure'), request, context);

    expect(sentry.captureRequestError).not.toHaveBeenCalled();
  });
});
