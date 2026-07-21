import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TRPCClientError } from '@trpc/client';

const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { captureUnexpectedTrpcClientFailure } from '../client-errors';

const context = {
  feature: 'auth',
  operation: 'verify_recovery_code',
  route: '/auth/mfa-verify',
};

function serverError(code: 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR'): TRPCClientError<never> {
  return new TRPCClientError('server failure', {
    result: {
      error: {
        code: code === 'BAD_REQUEST' ? -32600 : -32603,
        message: 'server failure',
        data: { code, httpStatus: code === 'BAD_REQUEST' ? 400 : 500 },
      },
    },
  } as never);
}

describe('captureUnexpectedTrpcClientFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['BAD_REQUEST', 'INTERNAL_SERVER_ERROR'] as const)(
    'does not recapture a shape-bearing %s server response',
    (code) => {
      expect(captureUnexpectedTrpcClientFailure(serverError(code), context)).toBe(false);
      expect(captureUnexpectedError).not.toHaveBeenCalled();
    },
  );

  it('captures the original fetch failure from a shape-less tRPC error', () => {
    const cause = new TypeError('fetch failed');
    const transportError = new TRPCClientError('fetch failed', { cause });

    expect(captureUnexpectedTrpcClientFailure(transportError, context)).toBe(true);
    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(captureUnexpectedError).toHaveBeenCalledWith(cause, {
      ...context,
      source: 'trpc_client_transport',
    });
  });

  it('captures a shape-less tRPC error itself when no original cause exists', () => {
    const transportError = new TRPCClientError('invalid transport response');

    captureUnexpectedTrpcClientFailure(transportError, context);

    expect(captureUnexpectedError).toHaveBeenCalledWith(transportError, {
      ...context,
      source: 'trpc_client_transport',
    });
  });

  it('captures a non-tRPC client failure that would otherwise be swallowed', () => {
    const original = new Error('router failed');

    captureUnexpectedTrpcClientFailure(original, context);

    expect(captureUnexpectedError).toHaveBeenCalledWith(original, {
      ...context,
      source: 'trpc_client',
    });
  });
});
