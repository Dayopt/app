import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';

import {
  applySessionContinuity,
  createEmptySessionContinuity,
  type SessionContinuity,
} from './session-continuity';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
};
const REFRESHED = {
  name: 'sb-access-token',
  value: 'refreshed',
  options: { path: '/', httpOnly: true },
};

describe('createEmptySessionContinuity', () => {
  it('cookies / headers ともに空を返す', () => {
    expect(createEmptySessionContinuity()).toEqual({ cookies: [], headers: {} });
  });
});

describe('applySessionContinuity', () => {
  it('redirect response に Cookie と headers を写し、同じ instance を返す', () => {
    const target = NextResponse.redirect(new URL('https://app.dayopt.app/auth/login'));
    const continuity: SessionContinuity = { cookies: [REFRESHED], headers: NO_CACHE_HEADERS };

    const result = applySessionContinuity(target, continuity);

    expect(result).toBe(target);
    expect(result.status).toBe(307);
    expect(result.cookies.get('sb-access-token')?.value).toBe('refreshed');
    expect(result.headers.getSetCookie()).toHaveLength(1);
    expect(result.headers.get('cache-control')).toBe(NO_CACHE_HEADERS['Cache-Control']);
    expect(result.headers.get('expires')).toBe('0');
    expect(result.headers.get('pragma')).toBe('no-cache');
  });

  it('空の continuity では何も足さない', () => {
    const target = NextResponse.next();

    const result = applySessionContinuity(target, createEmptySessionContinuity());

    expect(result.headers.getSetCookie()).toHaveLength(0);
    expect(result.headers.get('cache-control')).toBeNull();
  });

  it('複数 Cookie を反映する', () => {
    const target = NextResponse.next();
    const second = { name: 'sb-refresh-token', value: 'r2', options: { path: '/' } };

    applySessionContinuity(target, { cookies: [REFRESHED, second], headers: {} });

    expect(target.cookies.get('sb-access-token')?.value).toBe('refreshed');
    expect(target.cookies.get('sb-refresh-token')?.value).toBe('r2');
  });
});
