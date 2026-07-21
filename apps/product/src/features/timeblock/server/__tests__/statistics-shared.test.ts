import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { handleStatsError } from '../statistics-shared';

describe('handleStatsError observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['BAD_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT', 'TOO_MANY_REQUESTS'] as const)(
    'does not capture expected %s failures',
    (code) => {
      const error = new TRPCError({ code });

      expect(() => handleStatsError('overview', error)).toThrow(error);
      expect(captureUnexpectedError).not.toHaveBeenCalled();
    },
  );

  it('captures an unexpected TRPC failure with the original cause', () => {
    const cause = new Error('database failed');
    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause });

    expect(() => handleStatsError('overview', error)).toThrow(error);
    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);
    expect(captureUnexpectedError).toHaveBeenCalledWith(cause, {
      feature: 'statistics',
      source: 'statistics_router',
      operation: 'overview',
    });
  });

  it('captures an unknown failure once and preserves it as the TRPC cause', () => {
    const cause = new Error('query failed');

    try {
      handleStatsError('trend', cause);
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).cause).toBe(cause);
    }

    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);
    expect(captureUnexpectedError).toHaveBeenCalledWith(cause, {
      feature: 'statistics',
      source: 'statistics_router',
      operation: 'trend',
    });
  });
});
