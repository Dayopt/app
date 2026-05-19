import { describe, expect, it } from 'vitest';
import {
  createStructuredError,
  ErrorCategory,
  ErrorLevel,
  getErrorMessage,
  isAbortError,
  isNetworkError,
  isTimeoutError,
  toError,
} from '../error-utils';

describe('toError', () => {
  it('Error インスタンスはそのまま返す', () => {
    const err = new Error('test');
    expect(toError(err)).toBe(err);
  });

  it('文字列を Error に変換', () => {
    const result = toError('string error');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('string error');
  });

  it('オブジェクトを JSON.stringify して Error に変換', () => {
    const result = toError({ code: 404 });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('{"code":404}');
  });

  it('null を文字列変換', () => {
    const result = toError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('null');
  });

  it('undefined を文字列変換', () => {
    const result = toError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('undefined');
  });

  it('数値を文字列変換', () => {
    const result = toError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('42');
  });

  it('循環参照オブジェクトを安全に処理', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = toError(obj);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('[Unstringifiable Error Object]');
  });
});

describe('getErrorMessage', () => {
  it('Error からメッセージを取得', () => {
    expect(getErrorMessage(new Error('test'))).toBe('test');
  });

  it('文字列をそのまま返す', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('オブジェクトを JSON.stringify', () => {
    expect(getErrorMessage({ code: 404 })).toBe('{"code":404}');
  });

  it('null → "Unknown error"', () => {
    expect(getErrorMessage(null)).toBe('Unknown error');
  });

  it('undefined → "Unknown error"', () => {
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('数値を文字列変換', () => {
    expect(getErrorMessage(42)).toBe('42');
  });
});

describe('createStructuredError', () => {
  it('構造化エラーを生成', () => {
    const result = createStructuredError(
      'Test error',
      ErrorCategory.NETWORK,
      ErrorLevel.ERROR,
      'testContext',
    );

    expect(result.message).toBe('Test error');
    expect(result.category).toBe(ErrorCategory.NETWORK);
    expect(result.level).toBe(ErrorLevel.ERROR);
    expect(result.context).toBe('testContext');
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('デフォルトレベルは ERROR', () => {
    const result = createStructuredError('msg', ErrorCategory.INTERNAL);
    expect(result.level).toBe(ErrorLevel.ERROR);
  });
});

describe('isAbortError', () => {
  it('AbortError を検出', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(isAbortError(err)).toBe(true);
  });

  it('通常の Error は false', () => {
    expect(isAbortError(new Error('test'))).toBe(false);
  });

  it('非 Error は false', () => {
    expect(isAbortError('not an error')).toBe(false);
  });
});

describe('isNetworkError', () => {
  it('"fetch failed" メッセージを検出', () => {
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
  });

  it('"Failed to fetch" メッセージを検出', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
  });

  it('"network" を含むメッセージを検出', () => {
    expect(isNetworkError(new Error('network error occurred'))).toBe(true);
  });

  it('NetworkError name を検出', () => {
    const err = new Error('');
    err.name = 'NetworkError';
    expect(isNetworkError(err)).toBe(true);
  });

  it('通常のエラーは false', () => {
    expect(isNetworkError(new Error('something else'))).toBe(false);
  });
});

describe('isTimeoutError', () => {
  it('"timeout" メッセージを検出', () => {
    expect(isTimeoutError(new Error('Request timeout'))).toBe(true);
  });

  it('"timed out" メッセージを検出', () => {
    expect(isTimeoutError(new Error('Connection timed out'))).toBe(true);
  });

  it('TimeoutError name を検出', () => {
    const err = new Error('');
    err.name = 'TimeoutError';
    expect(isTimeoutError(err)).toBe(true);
  });

  it('AbortError もタイムアウトとして検出', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(isTimeoutError(err)).toBe(true);
  });
});
