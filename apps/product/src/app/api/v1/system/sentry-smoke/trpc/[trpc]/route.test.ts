// @vitest-environment node

import { createTRPCProxyClient, httpLink, TRPCClientError } from '@trpc/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OperatorSmokeRouter } from '@/lib/sentry/operator-smoke-router';

const mocks = vi.hoisted(() => ({
  authorizeProductOperatorSmoke: vi.fn(async () => ({ authorized: true as const })),
  captureUnexpectedTrpcAdapterError: vi.fn(),
  flush: vi.fn(async () => true),
  startNewTrace: vi.fn(<T>(callback: () => T) => callback()),
  startSpan: vi.fn(<T>(_options: unknown, callback: () => T) => callback()),
}));

vi.mock('@sentry/nextjs', () => ({
  flush: mocks.flush,
  startNewTrace: mocks.startNewTrace,
  startSpan: mocks.startSpan,
}));
vi.mock('@/lib/sentry/operator-smoke-auth', () => ({
  authorizeProductOperatorSmoke: mocks.authorizeProductOperatorSmoke,
  OPERATOR_SMOKE_RESPONSE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
  operatorSmokeUnavailableResponse: vi.fn(() => new Response(null, { status: 404 })),
}));
vi.mock('@/lib/trpc/errors', () => ({
  captureUnexpectedTrpcAdapterError: mocks.captureUnexpectedTrpcAdapterError,
}));

import { POST } from './route';

describe('Product operator tRPC smoke adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs the isolated mutation and reports its original failure once', async () => {
    const client = createTRPCProxyClient<OperatorSmokeRouter>({
      links: [
        httpLink({
          url: 'https://app.dayopt.app/api/v1/system/sentry-smoke/trpc',
          fetch: async (input, init) => POST(new Request(input, init as RequestInit)),
        }),
      ],
    });

    await expect(client.capture.mutate()).rejects.toBeInstanceOf(TRPCClientError);
    expect(mocks.authorizeProductOperatorSmoke).toHaveBeenCalledWith(
      expect.objectContaining({ body: null }),
    );
    expect(mocks.captureUnexpectedTrpcAdapterError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedTrpcAdapterError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
      'capture',
      '/api/v1/system/sentry-smoke/trpc',
    );
    expect(mocks.flush).toHaveBeenCalledOnce();
    expect(mocks.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'operator.sentry_smoke.trpc',
        forceTransaction: true,
      }),
      expect.any(Function),
    );
  });
});
