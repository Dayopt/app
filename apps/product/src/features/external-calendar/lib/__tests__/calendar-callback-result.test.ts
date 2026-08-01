import { describe, expect, it } from 'vitest';

import {
  parseCalendarCallbackResult,
  removeCalendarCallbackParams,
} from '../calendar-callback-result';

describe('parseCalendarCallbackResult', () => {
  it('接続成功を固定結果へ変換する', () => {
    expect(parseCalendarCallbackResult(new URLSearchParams('calendar=connected'))).toEqual({
      type: 'connected',
    });
  });

  it('表示可能な reason だけを固定エラーへ変換する', () => {
    expect(
      parseCalendarCallbackResult(new URLSearchParams('calendar=error&reason=account_mismatch')),
    ).toEqual({ type: 'error', error: 'account_mismatch' });
  });

  it('未知の provider reason を UI に露出しない', () => {
    expect(
      parseCalendarCallbackResult(new URLSearchParams('calendar=error&reason=raw-provider-detail')),
    ).toEqual({ type: 'error', error: 'generic' });
  });

  it('callback でなければ null', () => {
    expect(parseCalendarCallbackResult(new URLSearchParams('calendar=pending'))).toBeNull();
  });
});

describe('removeCalendarCallbackParams', () => {
  it('calendar / reason だけを削除し、他の query を保持する', () => {
    const result = removeCalendarCallbackParams(
      new URLSearchParams(
        'returnTo=%2Fweek%3Fdate%3D2026-08-01&calendar=error&reason=x&panel=review',
      ),
    );

    expect(result.toString()).toBe('returnTo=%2Fweek%3Fdate%3D2026-08-01&panel=review');
  });
});
