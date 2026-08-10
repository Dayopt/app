import { describe, expect, it } from 'vitest';

import { parseCheckoutCallbackResult, removeCheckoutCallbackParams } from '../checkout-callback';

describe('parseCheckoutCallbackResult', () => {
  it('success=true を success へ変換する', () => {
    expect(parseCheckoutCallbackResult('true', null)).toBe('success');
  });

  it('canceled=true を canceled へ変換する', () => {
    expect(parseCheckoutCallbackResult(null, 'true')).toBe('canceled');
  });

  it('どちらも無ければ null', () => {
    expect(parseCheckoutCallbackResult(null, null)).toBeNull();
  });

  it('success が true 以外の値なら null 扱いにする', () => {
    expect(parseCheckoutCallbackResult('1', null)).toBeNull();
  });

  it('success と canceled が両方 true なら success を優先する', () => {
    expect(parseCheckoutCallbackResult('true', 'true')).toBe('success');
  });
});

describe('removeCheckoutCallbackParams', () => {
  it('success / canceled だけを削除し、他の query を保持する', () => {
    const result = removeCheckoutCallbackParams(
      new URLSearchParams('returnTo=%2Fweek%3Fdate%3D2026-08-01&success=true&panel=review'),
    );

    expect(result.toString()).toBe('returnTo=%2Fweek%3Fdate%3D2026-08-01&panel=review');
  });

  it('canceled も削除対象になる', () => {
    const result = removeCheckoutCallbackParams(new URLSearchParams('canceled=true&foo=bar'));

    expect(result.toString()).toBe('foo=bar');
  });
});
