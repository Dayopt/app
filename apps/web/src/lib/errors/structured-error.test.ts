import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@web/platform/config/env', () => ({ isDevelopment: true }));

import { createStructuredError, ErrorCategory, ErrorLevel, logError } from './structured-error';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createStructuredError', () => {
  it('既存の category、context、original error と開発用 stack を保持する', () => {
    const originalError = new Error('source');
    const result = createStructuredError(
      'Test error',
      ErrorCategory.NETWORK,
      ErrorLevel.ERROR,
      'testContext',
      originalError,
    );

    expect(result).toMatchObject({
      message: 'Test error',
      category: ErrorCategory.NETWORK,
      level: ErrorLevel.ERROR,
      context: 'testContext',
      originalError,
    });
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.stack).toContain('Error: source');
  });

  it('デフォルトレベルは ERROR', () => {
    expect(createStructuredError('msg', ErrorCategory.INTERNAL).level).toBe(ErrorLevel.ERROR);
  });
});

describe('logError', () => {
  it('level に対応する console method と context prefix を使う', () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logError(createStructuredError('info', ErrorCategory.INTERNAL, ErrorLevel.INFO, 'source'));
    logError(createStructuredError('warn', ErrorCategory.INTERNAL, ErrorLevel.WARN));
    logError(createStructuredError('error', ErrorCategory.INTERNAL, ErrorLevel.ERROR));
    logError(createStructuredError('fatal', ErrorCategory.INTERNAL, ErrorLevel.FATAL));

    expect(info).toHaveBeenCalledWith('[source] info');
    expect(warn).toHaveBeenCalledWith('[INTERNAL] warn');
    expect(error).toHaveBeenCalledWith('[INTERNAL] error');
    expect(error).toHaveBeenCalledWith('[INTERNAL] fatal');
  });

  it('開発環境では original error、stack、timestamp を追加出力する', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const originalError = new Error('source');

    logError(
      createStructuredError(
        'failed',
        ErrorCategory.FILESYSTEM,
        ErrorLevel.ERROR,
        'reader',
        originalError,
      ),
    );

    expect(error).toHaveBeenCalledWith('Original error:', originalError);
    expect(error).toHaveBeenCalledWith('Stack trace:', expect.stringContaining('Error: source'));
    expect(error).toHaveBeenCalledWith('Timestamp:', expect.any(String));
  });
});
