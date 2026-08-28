import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { captureUnexpectedMcpToolError } from './tool-error';

describe('captureUnexpectedMcpToolError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expected tRPC outcomeはcaptureしない', () => {
    captureUnexpectedMcpToolError(
      new TRPCError({ code: 'BAD_REQUEST', message: 'invalid input' }),
      'entries_list',
    );

    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('unexpected tRPC failureは最深causeを一度captureする', () => {
    const original = new Error('database unavailable');
    const wrapped = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'request failed',
      cause: new Error('service failed', { cause: original }),
    });

    captureUnexpectedMcpToolError(wrapped, 'entries_list');

    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(captureUnexpectedError).toHaveBeenCalledWith(original, {
      feature: 'mcp',
      operation: 'entries_list',
      source: 'mcp_tool',
      errorCode: 'INTERNAL_SERVER_ERROR',
    });
  });
});
