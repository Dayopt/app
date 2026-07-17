import 'server-only';

import { TRPCError } from '@trpc/server';

import { captureUnexpectedError } from '@/lib/sentry';
import { getOriginalError, isExpectedTrpcError } from '@/lib/trpc/errors';

/** Report only unexpected MCP tool failures; caller/validation outcomes stay out of Issues. */
export function captureUnexpectedMcpToolError(error: unknown, operation: string): void {
  if (error instanceof TRPCError && isExpectedTrpcError(error)) return;

  const original =
    error instanceof TRPCError
      ? getOriginalError(error)
      : error instanceof Error
        ? error
        : new Error('Unexpected MCP tool failure', { cause: error });

  captureUnexpectedError(original, {
    feature: 'mcp',
    operation,
    source: 'mcp_tool',
    ...(error instanceof TRPCError ? { errorCode: error.code } : {}),
  });
}
