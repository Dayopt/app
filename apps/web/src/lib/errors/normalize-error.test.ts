import { describe, expect, it } from 'vitest';

import { getErrorMessage, toError } from './normalize-error';

describe('toError', () => {
  it('Error インスタンスはそのまま返す', () => {
    const error = new Error('test');
    expect(toError(error)).toBe(error);
  });

  it('文字列を Error に変換する', () => {
    expect(toError('string error').message).toBe('string error');
  });

  it('オブジェクトを JSON.stringify して Error に変換する', () => {
    expect(toError({ code: 404 }).message).toBe('{"code":404}');
  });

  it('primitive を文字列変換する', () => {
    expect(toError(null).message).toBe('null');
    expect(toError(undefined).message).toBe('undefined');
    expect(toError(42).message).toBe('42');
  });

  it('循環参照オブジェクトを fallback message に変換する', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(toError(value).message).toBe('[Unstringifiable Error Object]');
  });
});

describe('getErrorMessage', () => {
  it('Error と文字列から message を取得する', () => {
    expect(getErrorMessage(new Error('test'))).toBe('test');
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('message property を持つ plain object も JSON のまま返す', () => {
    expect(getErrorMessage({ message: 'plain object' })).toBe('{"message":"plain object"}');
  });

  it('nullish value は Unknown error を返す', () => {
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('循環参照オブジェクトを fallback message に変換する', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(getErrorMessage(value)).toBe('[Unstringifiable Error]');
  });
});
