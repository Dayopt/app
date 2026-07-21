import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@web/platform/config/env', () => ({ isDevelopment: false }));

import { createStructuredError, ErrorCategory, ErrorLevel, logError } from '../structured-error';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('structured error production logging', () => {
  it('stack を保持せず、original error と timestamp の追加ログを出さない', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const originalError = new Error('source');
    const structuredError = createStructuredError(
      'failed',
      ErrorCategory.INTERNAL,
      ErrorLevel.FATAL,
      'worker',
      originalError,
    );

    expect(structuredError.stack).toBeUndefined();
    logError(structuredError);

    expect(error.mock.calls).toEqual([['[worker] failed']]);
  });
});
