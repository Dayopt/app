import { UserCancellationError } from '@dayopt/observability';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedError = vi.hoisted(() => vi.fn());
const isExpectedAuthError = vi.hoisted(() =>
  vi.fn(
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      (error as Error & { code: string }).code === 'session_expired',
  ),
);

vi.mock('@/lib/sentry', () => ({ captureUnexpectedError, isExpectedAuthError }));

import {
  captureUnexpectedTrpcAdapterError,
  getOriginalError,
  handleServiceError,
  isExpectedTrpcError,
  ServiceError,
} from '../errors';

describe('handleServiceError observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not capture expected validation errors', () => {
    const original = new ServiceError('VALIDATION_FAILED', 'invalid input');

    expect(() => handleServiceError(original)).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', cause: original }),
    );
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('captures an unexpected service failure with the original Error', () => {
    const original = new ServiceError('FETCH_FAILED', 'database failed');

    expect(() => handleServiceError(original)).toThrow(TRPCError);
    expect(captureUnexpectedError).toHaveBeenCalledWith(original, {
      errorCode: 'FETCH_FAILED',
      source: 'trpc_service',
      operation: 'handle_service_error',
    });
  });

  it.each([
    'BAD_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'TOO_MANY_REQUESTS',
  ] as const)('does not capture expected %s TRPC errors', (code) => {
    const original = new TRPCError({ code });

    expect(isExpectedTrpcError(original)).toBe(true);
    expect(() => handleServiceError(original)).toThrow(original);
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('drops only an explicitly marked user cancellation', () => {
    const cancelled = new TRPCError({
      code: 'CLIENT_CLOSED_REQUEST',
      cause: new UserCancellationError(),
    });
    const timeout = new TRPCError({
      code: 'CLIENT_CLOSED_REQUEST',
      cause: new DOMException('timed out', 'AbortError'),
    });

    expect(isExpectedTrpcError(cancelled)).toBe(true);
    expect(isExpectedTrpcError(timeout)).toBe(false);
    captureUnexpectedTrpcAdapterError(cancelled, 'task.cancel');
    captureUnexpectedTrpcAdapterError(timeout, 'task.timeout');

    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(captureUnexpectedError).toHaveBeenCalledWith(timeout.cause, {
      errorCode: 'CLIENT_CLOSED_REQUEST',
      feature: 'trpc',
      operation: 'task.timeout',
      route: '/api/trpc',
      source: 'trpc_adapter',
    });
  });

  it('captures an unexpected TRPC error once with its original cause', () => {
    const cause = new Error('database connection failed');
    const original = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause });

    expect(isExpectedTrpcError(original)).toBe(false);
    expect(getOriginalError(original)).toBe(cause);
    expect(() => handleServiceError(original)).toThrow(original);
    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);
    expect(captureUnexpectedError).toHaveBeenCalledWith(cause, {
      errorCode: 'INTERNAL_SERVER_ERROR',
      source: 'trpc_service',
      operation: 'handle_trpc_error',
    });
  });

  it('does not re-capture an expected Auth error wrapped by a service failure', () => {
    const authError = Object.assign(new Error('session expired'), {
      status: 401,
      code: 'session_expired',
    });
    const wrapped = new ServiceError('RECOVERY_FAILED', 'recovery failed');
    wrapped.cause = authError;

    expect(() => handleServiceError(wrapped)).toThrow(TRPCError);
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('normalizes a non-Error failure without exposing its value', () => {
    let thrown: TRPCError | undefined;
    try {
      handleServiceError({ email: 'alice@example.com' });
    } catch (error) {
      thrown = error as TRPCError;
    }

    expect(thrown).toBeInstanceOf(TRPCError);
    expect(thrown?.cause).toBe(captureUnexpectedError.mock.calls[0]?.[0]);
    expect(captureUnexpectedError).toHaveBeenCalledWith(expect.any(Error), {
      source: 'trpc_service',
      operation: 'handle_unknown_error',
    });
    expect(captureUnexpectedError.mock.calls[0]?.[0].message).toBe('Unknown service error');
  });

  it('does not capture an expected error at the HTTP adapter boundary', () => {
    captureUnexpectedTrpcAdapterError(new TRPCError({ code: 'BAD_REQUEST' }), 'task.create');

    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('captures an unexpected error at the HTTP adapter boundary with its deepest cause', () => {
    const cause = new Error('database connection failed');
    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause });

    captureUnexpectedTrpcAdapterError(error, 'task.create');

    expect(captureUnexpectedError).toHaveBeenCalledWith(cause, {
      errorCode: 'INTERNAL_SERVER_ERROR',
      feature: 'trpc',
      operation: 'task.create',
      route: '/api/trpc',
      source: 'trpc_adapter',
    });
  });

  it('does not re-capture an expected Auth cause at the HTTP adapter boundary', () => {
    const authError = Object.assign(new Error('session expired'), {
      status: 401,
      code: 'session_expired',
    });
    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: authError });

    captureUnexpectedTrpcAdapterError(error, 'auth.refresh');

    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });
});
