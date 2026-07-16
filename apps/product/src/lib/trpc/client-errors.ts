'use client';

import type { TechnicalErrorContext } from '@dayopt/observability';
import { TRPCClientError } from '@trpc/client';

import { captureUnexpectedError } from '@/lib/sentry';

/**
 * A shape-bearing tRPC error was already classified and, if unexpected,
 * captured on the server. Only transport/client failures are captured here.
 */
export function captureUnexpectedTrpcClientFailure(
  error: unknown,
  context: TechnicalErrorContext,
): boolean {
  if (error instanceof TRPCClientError) {
    if (error.shape !== undefined && error.shape !== null) return false;
    const original = error.cause instanceof Error ? error.cause : error;
    captureUnexpectedError(original, { ...context, source: 'trpc_client_transport' });
    return true;
  }

  const original = error instanceof Error ? error : new Error('Unexpected tRPC client failure');
  captureUnexpectedError(original, { ...context, source: 'trpc_client' });
  return true;
}
