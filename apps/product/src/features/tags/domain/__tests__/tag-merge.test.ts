import { describe, expect, it } from 'vitest';

import { formatRpcErrorDetail } from '../tag-merge';

describe('formatRpcErrorDetail', () => {
  it('全フィールドを ` | ` 区切りで連結する', () => {
    expect(
      formatRpcErrorDetail({
        message: 'failed',
        code: 'P0001',
        details: 'detail text',
        hint: 'try again',
      }),
    ).toBe('failed | code=P0001 | details=detail text | hint=try again');
  });

  it('null フィールドを除外する', () => {
    expect(
      formatRpcErrorDetail({
        message: 'failed',
        code: null,
        details: null,
        hint: null,
      }),
    ).toBe('failed');
  });

  it('undefined フィールドを除外する', () => {
    expect(formatRpcErrorDetail({ message: 'failed' })).toBe('failed');
  });

  it('一部のみ存在 → 存在するフィールドだけ含む', () => {
    expect(
      formatRpcErrorDetail({
        message: 'failed',
        code: 'P0001',
        hint: 'check policy',
      }),
    ).toBe('failed | code=P0001 | hint=check policy');
  });

  it('空文字の補助フィールドは除外する', () => {
    expect(
      formatRpcErrorDetail({
        message: 'failed',
        code: '',
        details: '',
        hint: '',
      }),
    ).toBe('failed');
  });
});
